import axios from 'axios';
import { pool } from './db'; // Ensure the correct relative path to db.js

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      console.log("Incoming Shopify Webhook Payload:", JSON.stringify(req.body, null, 2));

      const shopifyPayload = req.body;

      if (
        !shopifyPayload.shipping_address ||
        !shopifyPayload.shipping_address.city ||
        !shopifyPayload.shipping_address.zip ||
        !shopifyPayload.shipping_address.address1 ||
        !shopifyPayload.shipping_address.phone
      ) {
        console.error("Validation failed: Missing required fields in Shopify payload.");
        return res.status(400).json({
          error: {
            context: "validation.error",
            message: "Missing required fields in Shopify payload: city, street, zipCode, or phone.",
          },
        });
      }

      const shippingAddress = {
        address1: shopifyPayload.shipping_address.address1,
        city: shopifyPayload.shipping_address.city,
        zip: shopifyPayload.shipping_address.zip,
        country: shopifyPayload.shipping_address.country || "Unknown",
        phone: shopifyPayload.shipping_address.phone,
      };

      const orderDetails = {
        shopifyOrderId: shopifyPayload.id,
        orderNumber: shopifyPayload.order_number,
        customerName: `${shopifyPayload.shipping_address.first_name} ${shopifyPayload.shipping_address.last_name}`,
        email: shopifyPayload.email || "",
        phone: shopifyPayload.phone || shopifyPayload.shipping_address.phone || "",
        shippingAddress: JSON.stringify(shippingAddress), // Convert shipping address to JSONB
        totalPrice: parseFloat(shopifyPayload.current_total_price || 0.0),
        currency: shopifyPayload.currency || "EUR",
        orderStatus: shopifyPayload.financial_status || "created",
      };

      console.log("Extracted Order Details:", JSON.stringify(orderDetails, null, 2));

      const siteId = await getSiteId(shippingAddress.city, shippingAddress.zip);
      console.log("Fetched siteId:", siteId);

      if (!siteId) throw new Error(`siteId not found for city: ${shippingAddress.city}, zipCode: ${shippingAddress.zip}`);

      const streetId = await getStreetId(siteId, shippingAddress.address1);
      console.log("Fetched streetId:", streetId);

      if (!streetId) throw new Error(`streetId not found for street: ${shippingAddress.address1}, siteId: ${siteId}`);

      const shipmentPayload = {
        userName: process.env.SPEEDY_USERNAME,
        password: process.env.SPEEDY_PASSWORD,
        language: "EN",
        sender: {
          phone1: { number: "0888112233" },
          contactName: "IVAN PETROV",
          email: "ivan@petrov.bg",
        },
        recipient: {
          phone1: { number: orderDetails.phone },
          clientName: orderDetails.customerName,
          privatePerson: true,
          address: {
            countryId: 100,
            siteId: siteId,
            streetId: streetId,
            streetNo: "N/A",
          },
        },
        service: { serviceId: 505, autoAdjustPickupDate: true },
        content: { parcelsCount: 1, contents: "Documents", package: "ENVELOPE", totalWeight: 0.2 },
        payment: { courierServicePayer: "RECIPIENT" },
        ref1: `Order-${orderDetails.shopifyOrderId}`,
      };

      console.log("Prepared Shipment Payload:", JSON.stringify(shipmentPayload, null, 2));

      // Save the order to the `orders` table if it doesn't already exist
      const insertOrderSQL = `
        INSERT INTO orders (shopify_order_id, order_number, customer_name, email, phone, shipping_address, total_price, currency, order_status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (shopify_order_id) DO NOTHING
      `;
      console.log("Executing SQL for orders:", insertOrderSQL, [
        orderDetails.shopifyOrderId,
        orderDetails.orderNumber,
        orderDetails.customerName,
        orderDetails.email,
        orderDetails.phone,
        orderDetails.shippingAddress,
        orderDetails.totalPrice,
        orderDetails.currency,
        orderDetails.orderStatus,
      ]);
      await pool.query(insertOrderSQL, [
        orderDetails.shopifyOrderId,
        orderDetails.orderNumber,
        orderDetails.customerName,
        orderDetails.email,
        orderDetails.phone,
        orderDetails.shippingAddress,
        orderDetails.totalPrice,
        orderDetails.currency,
        orderDetails.orderStatus,
      ]);

      // Save initial shipment details to the `shipments` table
      const insertShipmentSQL = `
        INSERT INTO shipments (order_id, shipment_status, created_at, updated_at) 
        VALUES ($1, $2, NOW(), NOW()) RETURNING id
      `;
      console.log("Executing SQL for shipments:", insertShipmentSQL, [
        orderDetails.shopifyOrderId,
        'pending',
      ]);
      const dbResult = await pool.query(insertShipmentSQL, [
        orderDetails.shopifyOrderId,
        'pending',
      ]);

      const shipmentId = dbResult.rows[0].id;

      // Make the API request to create the shipment
      const response = await axios.post(`${process.env.SPEEDY_API_BASE_URL}/shipment/`, shipmentPayload);

      console.log("Shipment created successfully:", response.data);

      // Update the shipment record with Speedy response details
      const updateShipmentSQL = `
        UPDATE shipments 
        SET speedy_shipment_id = $1, 
            waybill_url = $2, 
            shipment_status = $3, 
            api_response = $4, 
            updated_at = NOW() 
        WHERE id = $5
      `;
      console.log("Executing SQL for updating shipments:", updateShipmentSQL, [
        response.data.shipmentOrderNumber,
        response.data.waybill,
        'created',
        response.data,
        shipmentId,
      ]);
      await pool.query(updateShipmentSQL, [
        response.data.shipmentOrderNumber,
        response.data.waybill,
        'created',
        response.data,
        shipmentId,
      ]);

      res.status(200).json({
        message: "Shipment created successfully",
        shipmentData: response.data,
      });
    } catch (error) {
      const errorMessage = error.response?.data || error.message;

      console.error("Error handling Shopify webhook or creating shipment:", JSON.stringify(errorMessage, null, 2));
      res.status(500).json({
        error: {
          context: "shipment_creation_error",
          message: errorMessage,
        },
      });
    }
  } else {
    res.status(405).json({ error: "Method Not Allowed" });
  }
}

// Helper function to fetch siteId (City)
async function getSiteId(cityName, postCode) {
  try {
    const payload = {
      userName: process.env.SPEEDY_USERNAME,
      password: process.env.SPEEDY_PASSWORD,
      language: "EN",
      countryId: 100,
      name: cityName,
      postCode: postCode
    };

    const response = await axios.post(`${process.env.SPEEDY_API_BASE_URL}/location/site/`, payload);

    return response.data.sites?.[0]?.id;
  } catch (error) {
    console.error("Error fetching siteId:", error.response?.data || error.message);
    throw new Error("Could not fetch siteId");
  }
}

// Helper function to fetch streetId (Street)
async function getStreetId(siteId, streetName) {
  try {
    const normalizedStreetName = streetName.replace(/^(улица|ulitsa|ул\.|street)\s*/i, "").trim();

    const payload = {
      userName: process.env.SPEEDY_USERNAME,
      password: process.env.SPEEDY_PASSWORD,
      language: "EN",
      siteId: siteId,
      name: normalizedStreetName,
    };

    const response = await axios.post(`${process.env.SPEEDY_API_BASE_URL}/location/street/`, payload);

    return response.data.streets?.[0]?.id;
  } catch (error) {
    console.error("Error fetching streetId:", error.response?.data || error.message);
    throw new Error("Could not fetch streetId");
  }
}

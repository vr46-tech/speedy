import axios from 'axios';
import { pool } from './db';

async function getExistingShipment(orderId) {
  try {
    const result = await pool.query(
      `SELECT id, shipment_status, api_response 
       FROM shipments 
       WHERE order_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [orderId]
    );
    return result.rows[0];
  } catch (error) {
    console.error("Error fetching existing shipment:", error.message);
    throw error;
  }
}

async function updateShipmentStatus(shipmentId, status, apiResponse) {
  try {
    await pool.query(
      `UPDATE shipments 
       SET shipment_status = $1, 
           api_response = $2, 
           updated_at = NOW() 
       WHERE id = $3`,
      [status, apiResponse, shipmentId]
    );
  } catch (error) {
    console.error("Error updating shipment status:", error.message);
    throw error;
  }
}

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
        city: shopifyPayload.shipping_address.city,
        zipCode: shopifyPayload.shipping_address.zip,
        street: shopifyPayload.shipping_address.address1,
        shippingAddress: JSON.stringify(shippingAddress),
        totalPrice: parseFloat(shopifyPayload.current_total_price || 0.0),
        currency: shopifyPayload.currency || "EUR",
        orderStatus: shopifyPayload.financial_status || "created",
      };

      console.log("Extracted Order Details:", JSON.stringify(orderDetails, null, 2));

      const siteId = await getSiteId(orderDetails.city, orderDetails.zipCode);
      console.log("Fetched siteId:", siteId);

      if (!siteId) {
        throw new Error(`Site ID not found for city: ${orderDetails.city} and zip code: ${orderDetails.zipCode}`);
      }

      const streetId = await getStreetId(siteId, orderDetails.street);
      console.log("Fetched streetId:", streetId);

      if (!streetId) {
        throw new Error(`Street ID not found for street: ${orderDetails.street} in siteId: ${siteId}`);
      }

      const insertOrderSQL = `
        INSERT INTO orders (shopify_order_id, order_number, customer_name, email, phone, shipping_address, total_price, currency, order_status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (shopify_order_id) DO NOTHING
        RETURNING id
      `;

      const orderResult = await pool.query(insertOrderSQL, [
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

      let orderId = orderResult.rows[0]?.id;
      if (!orderId) {
        const fetchOrderIdSQL = `SELECT id FROM orders WHERE shopify_order_id = $1`;
        const fetchResult = await pool.query(fetchOrderIdSQL, [orderDetails.shopifyOrderId]);
        if (fetchResult.rows.length === 0) {
          throw new Error("Failed to retrieve order ID for the existing order.");
        }
        orderId = fetchResult.rows[0].id;
      }

      console.log("Retrieved Order ID:", orderId);

      let shipmentId;
      const existingShipment = await getExistingShipment(orderId);

      if (existingShipment) {
        if (existingShipment.shipment_status === 'created') {
          console.log("Shipment already exists. Skipping creation.");
          return res.status(200).json({
            message: "Shipment already created",
            shipmentData: existingShipment.api_response
          });
        }
        
        shipmentId = existingShipment.id;
        console.log(`Retrying shipment ID ${shipmentId} (current status: ${existingShipment.shipment_status})`);
      } else {
        const insertShipmentSQL = `
          INSERT INTO shipments (order_id, shipment_status, created_at, updated_at) 
          VALUES ($1, $2, NOW(), NOW()) 
          RETURNING id
        `;
        const dbResult = await pool.query(insertShipmentSQL, [orderId, 'pending']);
        shipmentId = dbResult.rows[0].id;
        console.log("Created new shipment record with ID:", shipmentId);
      }

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

      try {
        const response = await axios.post(`${process.env.SPEEDY_API_BASE_URL}/shipment/`, shipmentPayload);
        console.log("Shipment created successfully:", response.data);

        await updateShipmentStatus(
          shipmentId,
          'created',
          response.data
        );

        const updateShipmentSQL = `
          UPDATE shipments 
          SET speedy_shipment_id = $1, 
              waybill_url = $2, 
              shipment_status = $3, 
              api_response = $4, 
              updated_at = NOW() 
          WHERE id = $5
        `;
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
        await updateShipmentStatus(
          shipmentId,
          'failed',
          error.response?.data || { message: error.message }
        );

        const errorMessage = error.response?.data || error.message;
        console.error("Error creating shipment:", JSON.stringify(errorMessage, null, 2));
        
        res.status(500).json({
          error: {
            context: "shipment_creation_error",
            message: errorMessage,
          },
        });
      }

    } catch (error) {
      const errorMessage = error.response?.data || error.message;
      console.error("Error handling Shopify webhook:", JSON.stringify(errorMessage, null, 2));
      res.status(500).json({
        error: {
          context: "global_error",
          message: errorMessage,
        },
      });
    }
  } else {
    res.status(405).json({ error: "Method Not Allowed" });
  }
}

async function getSiteId(cityName, postCode) {
  try {
    const payload = {
      userName: process.env.SPEEDY_USERNAME,
      password: process.env.SPEEDY_PASSWORD,
      language: "EN",
      countryId: 100,
      name: cityName,
      postCode: postCode,
    };

    const response = await axios.post(`${process.env.SPEEDY_API_BASE_URL}/location/site/`, payload);

    if (!response.data.sites || response.data.sites.length === 0) {
      throw new Error(`No site found for city "${cityName}" and ZIP code "${postCode}".`);
    }

    return response.data.sites[0].id;
  } catch (error) {
    console.error("Error fetching siteId:", error.response?.data || error.message);
    throw new Error("Could not fetch siteId");
  }
}

async function getStreetId(siteId, streetName) {
  try {
    if (!streetName) {
      throw new Error("Street name is undefined or empty");
    }

    const normalizedStreetName = streetName.replace(/^(улица|ulitsa|ул\.|street)\s*/i, "").trim();

    const payload = {
      userName: process.env.SPEEDY_USERNAME,
      password: process.env.SPEEDY_PASSWORD,
      language: "EN",
      siteId: siteId,
      name: normalizedStreetName,
    };

    const response = await axios.post(`${process.env.SPEEDY_API_BASE_URL}/location/street/`, payload);

    if (!response.data.streets || response.data.streets.length === 0) {
      throw new Error(`No street found for name "${streetName}" in siteId "${siteId}".`);
    }

    return response.data.streets[0].id;
  } catch (error) {
    console.error("Error fetching streetId:", error.response?.data || error.message);
    throw new Error("Could not fetch streetId");
  }
}

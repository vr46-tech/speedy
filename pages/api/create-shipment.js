import axios from 'axios';
import { pool } from '../../lib/db'; // Import your database pool

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

      const orderDetails = {
        city: shopifyPayload.shipping_address.city,
        zipCode: shopifyPayload.shipping_address.zip,
        street: shopifyPayload.shipping_address.address1,
        sender: {
          phone1: { number: "0888112233" },
          contactName: "IVAN PETROV",
          email: "ivan@petrov.bg"
        },
        recipientPhone: shopifyPayload.shipping_address.phone,
        recipientName: `${shopifyPayload.shipping_address.first_name} ${shopifyPayload.shipping_address.last_name}`,
        service: { serviceId: 505, autoAdjustPickupDate: true },
        content: { parcelsCount: 1, contents: "Documents", package: "ENVELOPE", totalWeight: 0.2 },
        payment: { courierServicePayer: "RECIPIENT" },
        ref: `Order-${shopifyPayload.id}`
      };

      console.log("Extracted Order Details:", JSON.stringify(orderDetails, null, 2));

      const siteId = await getSiteId(orderDetails.city, orderDetails.zipCode);
      console.log("Fetched siteId:", siteId);

      if (!siteId) throw new Error(`siteId not found for city: ${orderDetails.city}, zipCode: ${orderDetails.zipCode}`);

      const streetId = await getStreetId(siteId, orderDetails.street);
      console.log("Fetched streetId:", streetId);

      if (!streetId) throw new Error(`streetId not found for street: ${orderDetails.street}, siteId: ${siteId}`);

      const payload = {
        userName: process.env.SPEEDY_USERNAME,
        password: process.env.SPEEDY_PASSWORD,
        language: "EN",
        sender: orderDetails.sender,
        recipient: {
          phone1: { number: orderDetails.recipientPhone },
          clientName: orderDetails.recipientName,
          privatePerson: true,
          address: {
            countryId: 100,
            siteId: siteId,
            streetId: streetId,
            streetNo: orderDetails.streetNo || "N/A",
          },
        },
        service: orderDetails.service,
        content: orderDetails.content,
        payment: orderDetails.payment,
        ref1: orderDetails.ref || "ORDER123456",
      };

      console.log("Prepared Shipment Payload:", JSON.stringify(payload, null, 2));

      // Save shipment details to the database before making the API request
      const dbResult = await pool.query(
        'INSERT INTO shipments (status, ref, recipient_name, city, zip_code, street) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        ['pending', orderDetails.ref, orderDetails.recipientName, orderDetails.city, orderDetails.zipCode, orderDetails.street]
      );

      const shipmentId = dbResult.rows[0].id;

      const response = await axios.post(`${process.env.SPEEDY_API_BASE_URL}/shipment/`, payload);

      console.log("Shipment created successfully:", response.data);

      // Update the shipment record with API response data
      await pool.query(
        'UPDATE shipments SET status = $1, shipment_order_number = $2, waybill = $3 WHERE id = $4',
        ['created', response.data.shipmentOrderNumber, response.data.waybill, shipmentId]
      );

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

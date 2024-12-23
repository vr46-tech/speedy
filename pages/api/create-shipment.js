import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // Log the incoming request body for debugging
      console.log("Incoming Shopify Webhook Payload:", JSON.stringify(req.body, null, 2));
      
      const shopifyPayload = req.body;

      // Check if required shipping information is present in the Shopify payload
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

      // Extract shipping details from Shopify payload
      const orderDetails = {
        city: shopifyPayload.shipping_address.city,
        zipCode: shopifyPayload.shipping_address.zip,
        street: shopifyPayload.shipping_address.address1,
        sender: {
          phone1: { number: "0888112233" }, // Default sender information
          contactName: "IVAN PETROV",
          email: "ivan@petrov.bg"
        },
        recipientPhone: shopifyPayload.shipping_address.phone,
        recipientName: `${shopifyPayload.shipping_address.first_name} ${shopifyPayload.shipping_address.last_name}`,
        service: {
          serviceId: 505,
          autoAdjustPickupDate: true
        },
        content: {
          parcelsCount: 1,
          contents: "Documents",
          package: "ENVELOPE",
          totalWeight: 0.2
        },
        payment: {
          courierServicePayer: "RECIPIENT"
        },
        ref: `Order-${shopifyPayload.id}`
      };

      console.log("Extracted Order Details:", JSON.stringify(orderDetails, null, 2));

      // Fetch siteId (City)
      const siteId = await getSiteId(orderDetails.city, orderDetails.zipCode);
      console.log("Fetched siteId:", siteId);
      
      if (!siteId) {
        console.error(`siteId not found for city: ${orderDetails.city}, zipCode: ${orderDetails.zipCode}`);
        return res.status(400).json({
          error: {
            context: "siteId.error",
            message: `City "${orderDetails.city}" with ZIP code "${orderDetails.zipCode}" not found.`,
          },
        });
      }

      // Fetch streetId (Street)
      const streetId = await getStreetId(siteId, orderDetails.street);
      console.log("Fetched streetId:", streetId);

      if (!streetId) {
        console.error(`streetId not found for street: ${orderDetails.street}, siteId: ${siteId}`);
        return res.status(400).json({
          error: {
            context: "streetId.error",
            message: `Street "${orderDetails.street}" not found in city "${orderDetails.city}".`,
          },
        });
      }

      // Prepare the shipment payload
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
            countryId: 100, // Bulgaria
            siteId: siteId,
            streetId: streetId,
            streetNo: orderDetails.streetNo || "N/A", // Default to "N/A" if not provided
            blockNo: orderDetails.blockNo || "",
            entranceNo: orderDetails.entranceNo || "",
            floorNo: orderDetails.floorNo || "",
            apartmentNo: orderDetails.apartmentNo || "",
          },
        },
        service: orderDetails.service,
        content: orderDetails.content,
        payment: orderDetails.payment,
        ref1: orderDetails.ref || "ORDER123456",
      };

      console.log("Prepared Shipment Payload:", JSON.stringify(payload, null, 2));

      // Make the API request to create the shipment
      const response = await axios.post(`${process.env.SPEEDY_API_BASE_URL}/shipment/`, payload);

      // Log the successful shipment creation
      console.log("Shipment created successfully:", response.data);

      res.status(200).json({
        message: "Shipment created successfully",
        shipmentData: response.data
      });
    } catch (error) {
      const errorMessage = error.response?.data || error.message;

      // Log and return the error
      console.error("Error handling Shopify webhook or creating shipment:", JSON.stringify(errorMessage, null, 2));
      res.status(500).json({
        error: {
          context: "shipment_creation_error",
          message: errorMessage,
        },
      });
    }
  } else {
    // Handle unsupported HTTP methods
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
      countryId: 100, // Bulgaria
      name: cityName,
      postCode: postCode
    };

    console.log("Fetching siteId with payload:", payload);

    const response = await axios.post(`${process.env.SPEEDY_API_BASE_URL}/location/site/`, payload);

    if (!response.data.sites || response.data.sites.length === 0) {
      throw new Error(`No site found for city "${cityName}" and ZIP code "${postCode}".`);
    }

    console.log("SiteId API response:", response.data);

    return response.data.sites[0]?.id; // Return the first matching siteId
  } catch (error) {
    console.error("Error fetching siteId:", error.response?.data || error.message);
    throw new Error("Could not fetch siteId");
  }
}

// Helper function to fetch streetId (Street)
// Helper function to fetch streetId (Street)
// Helper function to fetch streetId (Street)
async function getStreetId(siteId, streetName) {
  try {
    // Normalize street name by removing prefixes
    const normalizedStreetName = streetName.replace(/^(улица|ulitsa|ул\.|street)\s*/i, "").trim();

    const payload = {
      userName: process.env.SPEEDY_USERNAME,
      password: process.env.SPEEDY_PASSWORD,
      language: "EN",
      siteId: siteId,
      name: normalizedStreetName,
    };

    console.log("Fetching streetId with normalized payload:", payload);

    const response = await axios.post(`${process.env.SPEEDY_API_BASE_URL}/location/street/`, payload);

    if (!response.data.streets || response.data.streets.length === 0) {
      throw new Error(`No street found for name "${streetName}" in siteId "${siteId}".`);
    }

    console.log("StreetId API response:", response.data);

    return response.data.streets[0]?.id; // Return the first matching streetId
  } catch (error) {
    console.error("Error fetching streetId:", error.response?.data || error.message);
    throw new Error("Could not fetch streetId");
  }
}

import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const shopifyPayload = req.body;

      // Extract shipping information from Shopify payload
      if (
        !shopifyPayload.shipping_address ||
        !shopifyPayload.shipping_address.city ||
        !shopifyPayload.shipping_address.zip ||
        !shopifyPayload.shipping_address.address1 ||
        !shopifyPayload.shipping_address.phone
      ) {
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

      // Fetch siteId (City)
      const siteId = await getSiteId(orderDetails.city, orderDetails.zipCode);
      if (!siteId) {
        return res.status(400).json({
          error: {
            context: "siteId.error",
            message: `City "${orderDetails.city}" with ZIP code "${orderDetails.zipCode}" not found.`,
          },
        });
      }

      // Fetch streetId (Street)
      const streetId = await getStreetId(siteId, orderDetails.street);
      if (!streetId) {
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
      console.error("Error handling Shopify webhook or creating shipment:", errorMessage);
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

    const apiUrl = `${process.env.SPEEDY_API_BASE_URL}/location/site/`;
    console.log("Fetching siteId with payload:", payload, "API URL:", apiUrl);

    const response = await axios.post(apiUrl, payload);

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
async function getStreetId(siteId, streetName) {
  try {
    const payload = {
      userName: process.env.SPEEDY_USERNAME,
      password: process.env.SPEEDY_PASSWORD,
      language: "EN",
      siteId: siteId,
      name: streetName
    };

    console.log("Fetching streetId with payload:", payload);

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

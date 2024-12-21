import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { orderDetails } = req.body;

      // Validate required fields
      if (!orderDetails.city || !orderDetails.street || !orderDetails.sender || !orderDetails.recipientPhone || !orderDetails.zipCode) {
        return res.status(400).json({
          error: {
            context: "validation.error",
            message: "Missing required fields: city, street, zipCode, sender, or recipientPhone.",
          },
        });
      }

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

      // Return the response from Speedy API
      res.status(200).json(response.data);
    } catch (error) {
      const errorMessage = error.response?.data || error.message;

      // Log and return the error
      console.error("Error creating shipment:", errorMessage);
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

    console.log("StreetId API response:", response.data);

    return response.data.streets[0]?.id; // Return the first matching streetId
  } catch (error) {
    console.error("Error fetching streetId:", error.response?.data || error.message);
    throw new Error("Could not fetch streetId");
  }
}

import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { orderDetails } = req.body;

    // Validate required fields
    if (!orderDetails.phone || !orderDetails.name || !orderDetails.address) {
      return res.status(400).json({
        error: {
          context: "validation.error",
          message: "Missing required fields: phone, name, or address.",
        },
      });
    }

    try {
      // Prepare the request payload for Speedy's API
      const payload = {
        userName: process.env.SPEEDY_USERNAME,
        password: process.env.SPEEDY_PASSWORD,
        service: { serviceId: 505 }, // Example service ID, adjust as needed
        content: {
          parcelsCount: 1,
          totalWeight: 2.0,
          contents: "Order Items",
          package: "BOX",
        },
        recipient: {
          phone1: { number: orderDetails.phone },
          privatePerson: true,
          clientName: orderDetails.name,
          address: {
            countryId: 100,
            siteId: 68134,
            streetId: 3109,
            streetNo: orderDetails.address,
          },
        },
        payment: {
          payerRole: orderDetails.payerRole || "SENDER", // Default payerRole
        },
      };

      // Include the drop-off office (origin office)
      if (orderDetails.officeToBeCalledId) {
        payload.officeToBeCalledId = orderDetails.officeToBeCalledId; // Drop-off office ID
      }

      // Include the delivery office if specified
      if (orderDetails.deliveryToOffice && orderDetails.officeId) {
        payload.officeId = orderDetails.officeId; // Destination office ID
      }

      // Make the request to Speedy's API
      const response = await axios.post('https://api.speedy.bg/v1/shipment', payload);

      // Return the response from Speedy's API
      res.status(200).json(response.data);
    } catch (error) {
      const errorMessage = error.response?.data || error.message;

      // Handle errors
      if (
        errorMessage?.context ===
        "service_collection_validator.courier-collection-expired-office-collection-possible"
      ) {
        return res.status(400).json({
          error: {
            message: "Pickup time expired. Please drop off at an office.",
            suggestedOffice: "565 - Sofia - Druzhba 1, Do Ezeryoto",
          },
        });
      }

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

import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { orderDetails } = req.body;

    // Validate required fields
    if (!orderDetails.phone || !orderDetails.name || !orderDetails.officeId) {
      return res.status(400).json({
        error: {
          context: "validation.error",
          message: "Missing required fields: phone, name, or officeId.",
        },
      });
    }

    try {
      // Prepare the request payload for Speedy's API
      const payload = {
        userName: process.env.SPEEDY_USERNAME,
        password: process.env.SPEEDY_PASSWORD,
        language: "EN",
        sender: {
          phone1: { number: orderDetails.phone },
          contactName: orderDetails.name,
          dropoffOfficeId: orderDetails.officeId // The ID of the drop-off office
        },
        recipient: {
          phone1: { number: "0899445566" }, // Example recipient phone
          clientName: "Recipient Name", // Example recipient name
          privatePerson: true,
          pickupOfficeId: orderDetails.recipientOfficeId || 77 // ID of the recipient's pickup office
        },
        service: {
          serviceId: 505, // Adjust based on available services
          autoAdjustPickupDate: true
        },
        content: {
          parcelsCount: orderDetails.parcelsCount || 1,
          contents: orderDetails.contents || "Default package content",
          totalWeight: orderDetails.totalWeight || 0.5
        },
        payment: {
          courierServicePayer: orderDetails.payerRole || "SENDER"
        },
        ref1: `Order ${orderDetails.ref || "N/A"}`
      };

      // Make the request to Speedy's API
      const response = await axios.post('https://api.speedy.bg/v1/shipment', payload);

      // Return the response from Speedy's API
      res.status(200).json(response.data);
    } catch (error) {
      const errorMessage = error.response?.data || error.message;

      // Handle errors
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

import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { orderDetails } = req.body;

      // Validate required fields
      if (!orderDetails.sender || !orderDetails.recipient || !orderDetails.service) {
        return res.status(400).json({
          error: {
            context: "validation.error",
            message: "Missing required fields: sender, recipient, or service.",
          },
        });
      }

      // Prepare the request payload for Speedy's API
      const payload = {
        userName: process.env.SPEEDY_USERNAME,
        password: process.env.SPEEDY_PASSWORD,
        language: "EN",
        sender: orderDetails.sender,
        recipient: orderDetails.recipient,
        service: orderDetails.service,
        content: orderDetails.content,
        payment: orderDetails.payment,
        ref1: orderDetails.ref || "ORDER123456"
      };

      // Make the request to Speedy's API
      const response = await axios.post(
        `${process.env.SPEEDY_API_BASE_URL}/shipment/`,
        payload
      );

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

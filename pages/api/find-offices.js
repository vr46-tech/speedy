import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      // Base URL for Speedy's API
      const baseUrl = process.env.SPEEDY_API_BASE_URL || "https://api.speedy.bg/v1";

      // Payload to send to Speedy's API
      const payload = {
        userName: process.env.SPEEDY_USERNAME,
        password: process.env.SPEEDY_PASSWORD,
        language: "EN",
        countryId: 100, // 100 for Bulgaria
      };

      // Log the base URL for debugging
      console.log("Making request to:", `${baseUrl}/location/office/`);

      // Make the request to Speedy's API
      const response = await axios.post(`${baseUrl}/location/office/`, payload);

      // Return the list of offices
      res.status(200).json(response.data);
    } catch (error) {
      const errorMessage = error.response?.data || error.message;

      // Handle errors and log for debugging
      console.error("Error fetching offices:", errorMessage);

      res.status(500).json({
        error: {
          context: "office_fetch_error",
          message: errorMessage,
        },
      });
    }
  } else {
    // Handle unsupported HTTP methods
    res.status(405).json({ error: "Method Not Allowed" });
  }
}

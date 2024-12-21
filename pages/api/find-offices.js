import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      // Payload to send to Speedy's API
      const payload = {
        userName: process.env.SPEEDY_USERNAME,
        password: process.env.SPEEDY_PASSWORD,
        language: "EN",
        countryId: 100, // 100 for Bulgaria
      };

      // Make the request to Speedy's API
      const response = await axios.post(
        `${process.env.SPEEDY_API_BASE_URL}/location/office/`,
        payload
      );

      // Return the list of offices
      res.status(200).json(response.data);
    } catch (error) {
      // Handle errors
      res.status(500).json({
        error: {
          context: "office_fetch_error",
          message: error.response?.data || error.message,
        },
      });
    }
  } else {
    // Handle unsupported HTTP methods
    res.status(405).json({ error: "Method Not Allowed" });
  }
}

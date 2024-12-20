import axios from 'axios';

export default async function handler(req, res) {
  const { orderId } = req.query;

  try {
    const response = await axios.get(
      `https://${process.env.SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_API_TOKEN,
        },
      }
    );
    res.status(200).json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

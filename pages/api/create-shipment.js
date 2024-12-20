import axios from 'axios';

export default async function handler(req, res) {
  const { orderDetails } = req.body;

  try {
    const response = await axios.post('https://api.speedy.bg/v1/shipment', {
      userName: process.env.SPEEDY_USERNAME,
      password: process.env.SPEEDY_PASSWORD,
      service: { serviceId: 505 },
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
    });
    res.status(200).json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

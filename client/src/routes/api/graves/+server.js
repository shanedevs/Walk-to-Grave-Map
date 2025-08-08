/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request }) {
  const data = await request.json();

  // TODO: Save to Firestore or DB
  console.log('Received data:', data);

  // Simulate success response
  return new Response(JSON.stringify({
    message: 'Grave created successfully',
    data
  }), {
    status: 201,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

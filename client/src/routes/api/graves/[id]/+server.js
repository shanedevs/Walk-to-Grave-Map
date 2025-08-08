export async function GET({ params }) {
  const id = params.id;

  // Simulate a lookup (replace this with Firestore or DB fetch)
  const fakeGraves = {
    'Block-8-Private-15': {
      name: 'Juan Dela Cruz',
      date: '2023-01-01',
      location: 'Block 8, Private Lot 15'
    }
  };

  const grave = fakeGraves[id];

  if (!grave) {
    return new Response(JSON.stringify({ error: 'Grave not found' }), {
      status: 404
    });
  }

  return new Response(JSON.stringify(grave), {
    headers: { 'Content-Type': 'application/json' }
  });
}

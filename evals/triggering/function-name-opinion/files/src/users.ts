export async function getUser(id: string) {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

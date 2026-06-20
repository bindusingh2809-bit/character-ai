import axios from "axios";

// Defaults to "/api", which goes through the Vite dev proxy (see
// vite.config.js) straight to the FastAPI backend — no env file needed
// for normal local/Codespaces use. Set VITE_API_BASE_URL in a .env file
// only if you're pointing the frontend at a backend that ISN'T reachable
// through that proxy (e.g. a separately deployed production API).
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
});

export async function uploadCharacter(name, file) {
  const form = new FormData();
  form.append("name", name);
  form.append("file", file);
  const { data } = await client.post("/characters/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function listCharacters() {
  const { data } = await client.get("/characters");
  return data;
}

export async function getCharacter(id) {
  const { data } = await client.get(`/characters/${id}`);
  return data;
}

export async function saveSkeleton(skeleton) {
  const { data } = await client.put(
    `/characters/${skeleton.character_id}/skeleton`,
    skeleton
  );
  return data;
}

export async function deleteCharacter(id) {
  const { data } = await client.delete(`/characters/${id}`);
  return data;
}

/**
 * Loads a URL into an HTMLImageElement and waits for it to be ready.
 */
export function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => res(img)
    img.onerror = rej
    img.src = url
  })
}

/**
 * Strips the exterior background from an image via BFS flood-fill starting
 * from all four edges. Pixels that are:
 *   • already transparent (alpha < 10), OR
 *   • near-white (R, G, B all > 255 - tolerance)
 * …and reachable from the image border are made fully transparent.
 *
 * Interior white regions (e.g. a white shirt) are preserved because they
 * are enclosed by the character's outline and the fill can't reach them.
 *
 * Returns a Canvas with the cleaned pixel data.
 */
export function removeBackground(imgEl, tolerance = 32) {
  const W = imgEl.naturalWidth  || imgEl.width
  const H = imgEl.naturalHeight || imgEl.height
  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(imgEl, 0, 0)

  const imageData = ctx.getImageData(0, 0, W, H)
  const d = imageData.data

  const isBg = (i) =>
    d[i + 3] < 10 ||
    (d[i] > 255 - tolerance && d[i + 1] > 255 - tolerance && d[i + 2] > 255 - tolerance)

  const visited = new Uint8Array(W * H)
  const queue   = []

  const seed = (x, y) => {
    const idx = y * W + x
    if (!visited[idx] && isBg(idx * 4)) { visited[idx] = 1; queue.push(idx) }
  }

  for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1) }
  for (let y = 1; y < H - 1; y++) { seed(0, y); seed(W - 1, y) }

  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]
    d[idx * 4 + 3] = 0
    const x = idx % W
    const y = (idx / W) | 0
    if (x > 0     && !visited[idx - 1] && isBg((idx - 1) * 4)) { visited[idx - 1] = 1; queue.push(idx - 1) }
    if (x < W - 1 && !visited[idx + 1] && isBg((idx + 1) * 4)) { visited[idx + 1] = 1; queue.push(idx + 1) }
    if (y > 0     && !visited[idx - W] && isBg((idx - W) * 4)) { visited[idx - W] = 1; queue.push(idx - W) }
    if (y < H - 1 && !visited[idx + W] && isBg((idx + W) * 4)) { visited[idx + W] = 1; queue.push(idx + W) }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

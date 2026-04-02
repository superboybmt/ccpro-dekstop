import type { Area } from 'react-easy-crop'

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.setAttribute('crossOrigin', 'anonymous')
    image.src = url
  })

/**
 * Lấy phần đã crop từ ảnh ban đầu, resize xuống max 400x400 và nén webp
 */
export async function getCroppedImgBase64(
  imageSrc: string,
  pixelCrop: Area,
  maxWidth = 400,
  maxHeight = 400
): Promise<string> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Can not create canvas context')
  }

  // Calculate actual destination size (preserving aspect ratio, max bounds)
  const aspect = pixelCrop.width / pixelCrop.height
  let destWidth = pixelCrop.width
  let destHeight = pixelCrop.height

  if (destWidth > maxWidth) {
    destWidth = maxWidth
    destHeight = destWidth / aspect
  }
  if (destHeight > maxHeight) {
    destHeight = maxHeight
    destWidth = destHeight * aspect
  }

  // Set physical canvas size
  canvas.width = destWidth
  canvas.height = destHeight

  // Draw the cropped region into the resized canvas
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    destWidth,
    destHeight
  )

  // Returns data URL instead of Blob so we can save it directly
  return canvas.toDataURL('image/webp', 0.8)
}

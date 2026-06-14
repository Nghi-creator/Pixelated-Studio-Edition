export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function createCroppedAvatar(
  imageSrc: string,
  pixelCrop: CropArea,
): Promise<File> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error("The selected image could not be loaded."));
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2d context");
  if (pixelCrop.width <= 0 || pixelCrop.height <= 0) {
    throw new Error("The selected crop area is empty.");
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  context.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas is empty"));
        return;
      }
      resolve(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
    }, "image/jpeg");
  });
}

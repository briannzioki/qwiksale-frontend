const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD;
export function cdnUrl(publicId: string, w?: number, h?: number) {
  const size = w || h ? `w_${w||""},h_${h||""},c_fill` : "f_auto,q_auto";
  return `https://res.cloudinary.com/${CLOUD}/image/upload/${size}/${publicId}`;
}
export function cdnBlur(publicId: string) {
  // low-quality tiny image as data URL via Cloudinary's built-in blur
  return `https://res.cloudinary.com/${CLOUD}/image/upload/e_blur:800,q_10,w_24/${publicId}`;
}

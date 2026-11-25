import { useState } from 'react';
import { Wifi } from 'lucide-react';

interface MerakiModelThumbProps {
  model: string;
  size?: 'sm' | 'md';
}

const MODEL_IMAGES: Record<string, string> = {
  MR33: '/src/assets/images/meraki_mr33_icon_1795545644500.jpg',
  MR28: '/src/assets/images/meraki_mr28_icon_1795545645748.jpg',
  MR36: '/src/assets/images/meraki_mr36_icon_1795545645586.jpg',
};

function resolveModelImage(model: string): string {
  const key = model.replace(/\s+/g, '').toUpperCase();
  if (MODEL_IMAGES[key]) return MODEL_IMAGES[key];
  if (key.includes('28')) return MODEL_IMAGES.MR28;
  if (key.includes('36')) return MODEL_IMAGES.MR36;
  return MODEL_IMAGES.MR33;
}

export function MerakiModelThumb({ model, size = 'sm' }: MerakiModelThumbProps) {
  const [failed, setFailed] = useState(false);
  const src = resolveModelImage(model);
  const boxClass = size === 'md' ? 'w-11 h-11 rounded-lg' : 'w-9 h-9 rounded-md';

  if (failed) {
    return (
      <div
        className={`${boxClass} bg-[#F1F3F5] border border-[#DEE2E6] flex items-center justify-center text-[#2C3E50] shrink-0`}
        aria-hidden="true"
      >
        <Wifi className="w-4 h-4" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`Access Point Cisco Meraki ${model}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${boxClass} object-cover border border-[#DEE2E6] bg-[#F8F9FA] shrink-0 shadow-2xs`}
    />
  );
}

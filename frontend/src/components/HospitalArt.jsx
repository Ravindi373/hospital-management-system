// The picture at the top of the sign-in card (replace with your hospital's logo or photo if you have one).
export default function HospitalArt({ small }) {
  const wins = [];
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 2; r += 1) wins.push([70 + c * 24 + (c > 1 ? 12 : 0), 76 + r * 24]);
  return (
    <svg className="auth-art" style={small ? { maxWidth: 140 } : undefined} viewBox="0 0 240 180" role="img" aria-label="Hospital building">
      <rect width="240" height="180" rx="16" className="a-sky" />
      <circle cx="196" cy="38" r="16" className="a-sun" />
      <rect y="150" width="240" height="30" className="a-ground" />
      <rect x="58" y="62" width="124" height="92" rx="4" className="a-wall" />
      <rect x="94" y="34" width="52" height="40" rx="4" className="a-wall" />
      <rect x="113" y="40" width="14" height="28" rx="2" className="a-cross" /><rect x="106" y="47" width="28" height="14" rx="2" className="a-cross" />
      {wins.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="14" height="14" rx="2" className="a-win" />)}
      <rect x="104" y="122" width="32" height="32" rx="3" className="a-door" />
      <rect x="96" y="114" width="48" height="8" rx="2" className="a-cross" />
      <circle cx="34" cy="128" r="16" className="a-tree" /><rect x="32" y="138" width="4" height="14" className="a-trunk" />
      <circle cx="210" cy="132" r="12" className="a-tree" /><rect x="208" y="140" width="4" height="12" className="a-trunk" />
    </svg>
  );
}

export default function Metric({ icon: Icon, label, value, unit, detail, accent }) {
  return <article className={`metric-card ${accent ? 'metric-accent' : ''}`}><div className="metric-top"><span>{label}</span><Icon size={19} /></div><p className="metric-value">{value}<span>{unit}</span></p><p className="metric-detail">{detail}</p></article>;
}

import { geoMap } from "@/data/geoMap";
import styles from "./GeoMap.module.css";

type PointId = keyof typeof geoMap.points;
type CountryId = "cn" | "kr" | "jp";
type Label = { text: string; at: PointId; dx: number; dy: number; anchor?: "start" | "middle" | "end" };

const fromVladivostok = [
  { via: ["vladivostok", "moscow"], bend: 0.16 },
  { via: ["vladivostok", "astrakhan"], bend: 0.12 },
  { via: ["vladivostok", "krasnodar"], bend: 0.09 },
  { via: ["vladivostok", "tolyatti"], bend: 0.15 },
] satisfies { via: PointId[]; bend: number }[];

const fanOut = (from: PointId) =>
  [
    { via: [from, "moscow"], bend: -0.18 },
    { via: [from, "astrakhan"], bend: 0.14 },
    { via: [from, "krasnodar"], bend: -0.12 },
    { via: [from, "tolyatti"], bend: 0.1 },
  ] satisfies { via: PointId[]; bend: number }[];

const routes: Record<CountryId, { via: PointId[]; bend: number }[]> = {
  cn: [{ via: ["suifenhe", "vladivostok"], bend: 0.6 }, ...fromVladivostok, ...fanOut("khorgos")],
  kr: [
    { via: ["busan", "vladivostok"], bend: -0.25 },
    ...fromVladivostok,
    { via: ["incheon", "bishkek"], bend: 0.12 },
    ...fanOut("bishkek"),
  ],
  jp: [
    { via: ["maizuru", "vladivostok"], bend: 0.3 },
    { via: ["toyama", "vladivostok"], bend: 0.12 },
    { via: ["nagoya", "vladivostok"], bend: -0.12 },
    { via: ["yokohama", "vladivostok"], bend: -0.3 },
    ...fromVladivostok,
  ],
};

const hubs: Record<CountryId, { points: PointId[]; labels: Label[] }> = {
  cn: {
    points: ["suifenhe", "khorgos"],
    labels: [
      { text: "Суйфэньхэ", at: "suifenhe", dx: -10, dy: -8, anchor: "end" },
      { text: "Хоргос", at: "khorgos", dx: 0, dy: 22, anchor: "middle" },
    ],
  },
  kr: {
    points: ["busan", "incheon", "bishkek"],
    labels: [
      { text: "Пусан", at: "busan", dx: -10, dy: 12, anchor: "end" },
      { text: "Инчхон", at: "incheon", dx: -10, dy: -4, anchor: "end" },
      { text: "Бишкек", at: "bishkek", dx: 0, dy: 22, anchor: "middle" },
    ],
  },
  jp: {
    points: ["toyama", "maizuru", "nagoya", "yokohama"],
    labels: [
      { text: "Тояма и Майдзуру", at: "maizuru", dx: -10, dy: 14, anchor: "end" },
      { text: "Иокогама и Нагоя", at: "yokohama", dx: 10, dy: 12, anchor: "start" },
    ],
  },
};

const destinations: Label[] = [
  { text: "Владивосток", at: "vladivostok", dx: 12, dy: -8 },
  { text: "Москва", at: "moscow", dx: 12, dy: -8 },
];

const offices: Label[] = [
  { text: "Краснодар", at: "krasnodar", dx: -9, dy: 5, anchor: "end" },
  { text: "Астрахань", at: "astrakhan", dx: 9, dy: 5 },
  { text: "Тольятти", at: "tolyatti", dx: 9, dy: 5 },
];

function curve(via: PointId[], bend: number) {
  return via.slice(1).reduce((d, id, i) => {
    const [x1, y1] = geoMap.points[via[i]];
    const [x2, y2] = geoMap.points[id];
    const cx = (x1 + x2) / 2 - (y2 - y1) * bend;
    const cy = (y1 + y2) / 2 + (x2 - x1) * bend;
    return `${d} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2} ${y2}`;
  }, `M${geoMap.points[via[0]].join(" ")}`);
}

function Text({ text, at, dx, dy, anchor = "start", className }: Label & { className: string }) {
  const [x, y] = geoMap.points[at];
  return (
    <text className={className} x={x + dx} y={y + dy} textAnchor={anchor}>
      {text}
    </text>
  );
}

export function GeoMap({ active }: { active: CountryId }) {
  return (
    <svg className={styles.svg} viewBox={geoMap.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <filter id="geo-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="geo-spark" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path className={styles.bg} d={geoMap.bg} />
      <path className={styles.land} d={geoMap.land.ru} />
      {(["cn", "kr", "jp"] as const).map((id) => (
        <g key={id} className={styles.country} data-active={id === active || undefined}>
          <path className={styles.glow} d={geoMap.land[id]} filter="url(#geo-glow)" />
          <path className={styles.land} d={geoMap.land[id]} />
        </g>
      ))}

      <g key={active} className={styles.routes}>
        {routes[active].map((r, i) => {
          const d = curve(r.via, r.bend);
          const delay = { animationDelay: `${i * 0.15}s` };
          const sparkDelay = { animationDelay: `${1 + i * 0.35}s` };
          return (
            <g key={r.via.join("-")}>
              <path className={styles.trace} d={d} pathLength={1} style={delay} />
              <path className={styles.dash} d={d} style={delay} />
              <path className={styles.spark} d={d} pathLength={100} filter="url(#geo-spark)" style={sparkDelay} />
            </g>
          );
        })}

        {hubs[active].points.map((id, i) => {
          const [x, y] = geoMap.points[id];
          return (
            <g key={id} className={styles.hub} style={{ animationDelay: `${0.2 + i * 0.1}s` }}>
              <g className={styles.marker}>
                <circle className={styles.halo} cx={x} cy={y} r={11} style={{ animationDelay: `${i * 0.4}s` }} />
                <circle className={styles.dot} cx={x} cy={y} r={4.5} />
              </g>
            </g>
          );
        })}
        {hubs[active].labels.map((l) => (
          <Text key={l.text} {...l} className={styles.label} />
        ))}
      </g>

      {offices.map((o) => {
        const [x, y] = geoMap.points[o.at];
        return (
          <g key={o.at}>
            <g className={styles.marker}>
              <circle className={styles.office} cx={x} cy={y} r={4.5} />
            </g>
            <Text {...o} className={styles.officeLabel} />
          </g>
        );
      })}

      {destinations.map((dst) => {
        const [x, y] = geoMap.points[dst.at];
        return (
          <g key={dst.at}>
            <g className={styles.marker}>
              <circle className={styles.destHalo} cx={x} cy={y} r={18} />
              <circle className={styles.destRing} cx={x} cy={y} r={8.5} />
              <circle className={styles.destDot} cx={x} cy={y} r={5} />
            </g>
            <Text {...dst} className={styles.destLabel} />
          </g>
        );
      })}
    </svg>
  );
}

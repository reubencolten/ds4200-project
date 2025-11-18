// === interactive line chart — D3 v7 ===

// sizing
const margin = { top: 28, right: 190, bottom: 44, left: 60 };
const outerW = 1100, outerH = 560;
const width  = outerW - margin.left - margin.right;
const height = outerH - margin.top - margin.bottom;

const svg = d3.select("#chart").append("svg")
  .attr("width", outerW)
  .attr("height", outerH);

const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

const x = d3.scaleLinear().range([0, width]);
const y = d3.scaleLinear().range([height, 0]);
const color = d3.scaleOrdinal(d3.schemeTableau10);

const xAxisG = g.append("g").attr("transform", `translate(0,${height})`);
const yAxisG = g.append("g");

g.append("text").attr("x", width / 2).attr("y", height + 36)
  .attr("text-anchor", "middle").attr("class", "label").text("Year");
g.append("text").attr("transform", "rotate(-90)")
  .attr("x", -height / 2).attr("y", -44)
  .attr("text-anchor", "middle").attr("class", "label").text("Sales (millions)");

const linesLayer  = g.append("g");
const dotsLayer   = g.append("g");
const legendLayer = g.append("g").attr("transform", `translate(${width + 16}, 6)`);
const tooltip     = d3.select("#tooltip");

let rawRows = [];
let currentRegion = "Global_Sales";
let currentFamily = "All";
const visibleByGenre = new Map();

function platformFamily(p) {
  p = String(p).trim().toUpperCase();
  const n = new Set(["SWITCH","WII","WIIU","DS","3DS","GBA","GC","N64","SNES","NES"]);
  const s = new Set(["PS","PS2","PS3","PS4","PS5","PSP","PSV"]);
  const xbx = new Set(["XB","XBOX","X360","XONE","XSERIES"]);
  if (n.has(p)) return "Nintendo";
  if (s.has(p)) return "PlayStation";
  if (xbx.has(p)) return "Xbox";
  if (p === "PC") return "PC";
  return "Other";
}

function aggregate(rows, regionKey) {
  const parsed = rows
    .map(d => ({
      Year: +d.Year,
      Genre: d.Genre || "Unknown",
      Platform: d.Platform || "",
      Sales: +d[regionKey] || 0
    }))
    .filter(d => Number.isFinite(d.Year) && d.Year >= 2000)
    .filter(d => currentFamily === "All" ? true : platformFamily(d.Platform) === currentFamily);

  const byGenreYear = d3.rollup(
    parsed,
    v => d3.sum(v, d => d.Sales),
    d => d.Genre,
    d => d.Year
  );

  return Array.from(byGenreYear, ([genre, yearMap]) => ({
    genre,
    values: Array.from(yearMap, ([Year, Sales]) => ({ Year, Sales }))
      .sort((a, b) => a.Year - b.Year)
  }));
}

function update() {
  const series = aggregate(rawRows, currentRegion);
  if (visibleByGenre.size === 0) series.forEach(s => visibleByGenre.set(s.genre, true));

  const allYears = series.flatMap(s => s.values.map(v => v.Year));
  const allSales = series.flatMap(s => s.values.map(v => v.Sales));
  x.domain(d3.extent(allYears));
  y.domain([0, d3.max(allSales) || 1]);
  color.domain(series.map(s => s.genre));

  xAxisG.call(d3.axisBottom(x).tickFormat(d3.format("d")));
  yAxisG.call(d3.axisLeft(y));

  const line = d3.line().x(d => x(d.Year)).y(d => y(d.Sales));
  const visible = series.filter(s => visibleByGenre.get(s.genre));

  const paths = linesLayer.selectAll("path.series").data(visible, d => d.genre);
  paths.enter().append("path")
    .attr("class", "series").attr("fill", "none").attr("stroke-width", 2)
    .merge(paths)
    .attr("stroke", d => color(d.genre))
    .attr("d", d => line(d.values));
  paths.exit().remove();

  const dotsData = visible.flatMap(s => s.values.map(v => ({ ...v, genre: s.genre })));
  const dots = dotsLayer.selectAll("circle.dot").data(dotsData, d => `${d.genre}-${d.Year}`);
  dots.enter().append("circle").attr("r", 3).attr("class", "dot")
    .merge(dots)
    .attr("cx", d => x(d.Year)).attr("cy", d => y(d.Sales))
    .attr("fill", d => color(d.genre))
    .on("mouseenter", (e, d) => {
      tooltip.style("opacity", 1)
        .html(`Year: <b>${d.Year}</b><br>Genre: <b>${d.genre}</b><br>${currentRegion}: <b>${d.Sales.toFixed(2)}M</b>`)
        .style("left", e.pageX + 12 + "px").style("top", e.pageY + 12 + "px");
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));
  dots.exit().remove();

  const legend = legendLayer.selectAll("g.item").data(series, d => d.genre);
  const enter = legend.enter().append("g").attr("class", "item")
    .attr("transform", (d, i) => `translate(0, ${i * 18})`)
    .style("cursor", "pointer")
    .on("click", (e, d) => {
      visibleByGenre.set(d.genre, !visibleByGenre.get(d.genre));
      update();
    });

  enter.append("rect").attr("x", 0).attr("y", -9).attr("width", 12).attr("height", 12)
    .attr("rx", 2).attr("fill", d => color(d.genre));
  enter.append("text").attr("x", 18).attr("y", 0)
    .attr("dominant-baseline", "middle").text(d => d.genre);

  legend.select("rect").attr("fill", d => color(d.genre))
    .attr("fill-opacity", d => visibleByGenre.get(d.genre) ? 1 : 0.25);
  legend.exit().remove();
}

// === Auto-load CSV ===
d3.csv("vgsales.csv").then(data => {
  console.log("Loaded:", data.length, "rows");
  rawRows = data;
  visibleByGenre.clear();
  update();
}).catch(err => console.error("CSV load failed:", err));

document.getElementById("regionSelect").addEventListener("change", e => {
  currentRegion = e.target.value;
  update();
});
document.getElementById("platformSelect").addEventListener("change", e => {
  currentFamily = e.target.value;
  update();
});

// Mustafa's interactive line chart — D3 v7
// Upload CSV, select region and platform family, hover over dots, and click legend to toggle.

// === sizing ===
const margin = { top: 28, right: 190, bottom: 44, left: 60 };
const outerW = 1100, outerH = 560;
const width  = outerW - margin.left - margin.right;
const height = outerH - margin.top - margin.bottom;

// root svg
const svg = d3.select("#chart")
  .append("svg")
  .attr("width", outerW)
  .attr("height", outerH);

const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

// axes scaffolding
const x = d3.scaleLinear().range([0, width]);
const y = d3.scaleLinear().range([height, 0]);
const color = d3.scaleOrdinal(d3.schemeTableau10);

const xAxisG = g.append("g").attr("class", "axis").attr("transform", `translate(0,${height})`);
const yAxisG = g.append("g").attr("class", "axis");

// axis labels
g.append("text")
  .attr("class", "label")
  .attr("x", width / 2).attr("y", height + 36)
  .attr("text-anchor", "middle")
  .text("Year");

g.append("text")
  .attr("class", "label")
  .attr("transform", "rotate(-90)")
  .attr("x", -height / 2).attr("y", -44)
  .attr("text-anchor", "middle")
  .text("Sales (millions)");

// layers
const linesLayer  = g.append("g");
const dotsLayer   = g.append("g");
const legendLayer = g.append("g").attr("class", "legend").attr("transform", `translate(${width + 16}, 6)`);
const tooltip     = d3.select("#tooltip");

// ===== state =====
let rawRows = [];
let currentRegion = "Global_Sales";
let currentFamily = "All";
const visibleByGenre = new Map(); // legend toggle state

// quick mapping from specific platform codes to "families"
function platformFamily(platformCode = "") {
  const p = String(platformCode).trim().toUpperCase();

  const nintendo = new Set(["SWITCH","WII","WIIU","DS","3DS","GBA","GC","N64","SNES","NES"]);
  const playstation = new Set(["PS","PS2","PS3","PS4","PS5","PSP","PSV"]);
  const xbox = new Set(["XB","XBOX","X360","XONE","XSERIES"]);

  if (nintendo.has(p)) return "Nintendo";
  if (playstation.has(p)) return "PlayStation";
  if (xbox.has(p)) return "Xbox";
  if (p === "PC") return "PC";
  return "Other";
}

// aggregate rows -> array of { genre, values: [{Year, Sales}, ...] }
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

  // rollup by Genre then Year and sum sales
  const byGenreYear = d3.rollup(
    parsed,
    v => d3.sum(v, d => d.Sales),
    d => d.Genre,
    d => d.Year
  );

  const series = Array.from(byGenreYear, ([genre, yearMap]) => ({
    genre,
    values: Array.from(yearMap, ([Year, Sales]) => ({ Year, Sales }))
               .sort((a, b) => a.Year - b.Year)
  }));

  return series;
}

function update() {
  if (!rawRows.length) return;

  const series = aggregate(rawRows, currentRegion);

  // initialize legend state on first run or after new file
  if (visibleByGenre.size === 0) {
    series.forEach(s => visibleByGenre.set(s.genre, true));
  }

  // domains
  const allYears  = series.flatMap(s => s.values.map(v => v.Year));
  const allSales  = series.flatMap(s => s.values.map(v => v.Sales));
  const xDomain   = d3.extent(allYears);
  const yMax      = d3.max(allSales) || 1;

  x.domain(xDomain);
  y.domain([0, yMax]);
  color.domain(series.map(s => s.genre));

  xAxisG.call(d3.axisBottom(x).tickFormat(d3.format("d")));
  yAxisG.call(d3.axisLeft(y));

  const lineGen = d3.line()
    .x(d => x(d.Year))
    .y(d => y(d.Sales));

  const visible = series.filter(s => visibleByGenre.get(s.genre));

  // lines
  const lines = linesLayer.selectAll("path.series")
    .data(visible, d => d.genre);

  lines.enter()
    .append("path")
    .attr("class", "series")
    .attr("fill", "none")
    .attr("stroke-width", 2)
    .merge(lines)
    .attr("stroke", d => color(d.genre))
    .attr("d", d => lineGen(d.values));

  lines.exit().remove();

  // dots for tooltips
  const dotsData = visible.flatMap(s => s.values.map(v => ({ ...v, genre: s.genre })));

  const dots = dotsLayer.selectAll("circle.dot")
    .data(dotsData, d => `${d.genre}-${d.Year}`);

  dots.enter()
    .append("circle")
    .attr("class", "dot")
    .attr("r", 3)
    .merge(dots)
    .attr("cx", d => x(d.Year))
    .attr("cy", d => y(d.Sales))
    .attr("fill", d => color(d.genre))
    .on("mouseenter", (event, d) => {
      tooltip
        .style("opacity", 1)
        .html(
          `Year: <b>${d.Year}</b><br>` +
          `Genre: <b>${d.genre}</b><br>` +
          `${currentRegion}: <b>${d.Sales.toFixed(2)}M</b>`
        )
        .style("left", (event.pageX + 12) + "px")
        .style("top",  (event.pageY + 12) + "px");
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  dots.exit().remove();

  // legend (click to toggle genre visibility)
  const legend = legendLayer.selectAll("g.item")
    .data(series, d => d.genre);

  const enter = legend.enter()
    .append("g")
    .attr("class", "item")
    .attr("transform", (d, i) => `translate(0, ${i * 18})`)
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      visibleByGenre.set(d.genre, !visibleByGenre.get(d.genre));
      update();
    });

  enter.append("rect")
    .attr("x", 0).attr("y", -9).attr("width", 12).attr("height", 12).attr("rx", 2)
    .attr("fill", d => color(d.genre));

  enter.append("text")
    .attr("x", 18).attr("y", 0).attr("dominant-baseline", "middle")
    .text(d => d.genre);

  legend.select("rect")
    .attr("fill", d => color(d.genre))
    .attr("fill-opacity", d => visibleByGenre.get(d.genre) ? 1 : 0.25);

  legend.exit().remove();
}

// ===== UI wiring =====
const fileInput = document.getElementById("fileInput");
const fileName  = document.getElementById("fileName");

fileInput.addEventListener("change", e => {
  const file = e.target.files?.[0];
  if (!file) return;

  fileName.textContent = `(${file.name})`;

  const reader = new FileReader();
  reader.onload = ev => {
    rawRows = d3.csvParse(ev.target.result);
    visibleByGenre.clear(); // reset toggles for new file
    update();
  };
  reader.readAsText(file);
});

document.getElementById("regionSelect").addEventListener("change", e => {
  currentRegion = e.target.value;
  update();
});

document.getElementById("platformSelect").addEventListener("change", e => {
  currentFamily = e.target.value; // All | Nintendo | PlayStation | Xbox | PC | Other
  update();
});

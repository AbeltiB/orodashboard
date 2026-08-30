// src/lib/telegram/pdf.ts
// Server-side PDF rendering for the daily financial report's attachment.
// pdfkit is pure JS (no headless browser, no native binary) — same weight
// class as exceljs, which already backs the Excel attachments, so it fits
// this app's Render deployment the same way. Renders with pdfkit's flowing
// text API only (no absolute x/y placement), so pages break automatically
// wherever content runs past the bottom margin — no manual pagination.
import PDFDocument from "pdfkit";
import { fmtDateLabel, fmtETB, sortStationEntries, type StationBucket } from "./reports";

function collectPdfBuffer(render: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    render(doc);
    doc.end();
  });
}

function renderReport(
  doc: PDFKit.PDFDocument,
  title: string,
  dateLabel: string,
  stations: [string, StationBucket][],
  grandRevenue: number,
  grandServiceCharge: number
) {
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111").text(title);
  doc.font("Helvetica").fontSize(11).fillColor("#555").text(dateLabel);
  doc.moveDown(0.6);
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#000")
    .text(
      `Grand total — Revenue: ${fmtETB(grandRevenue)}   |   Service charge: ${fmtETB(grandServiceCharge)}   |   Total: ${fmtETB(grandRevenue + grandServiceCharge)}`
    );
  doc.moveDown(1);

  for (const [name, station] of stations) {
    const total = station.revenue + station.serviceCharge;
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor("#111")
      .text(`${name}   —   Revenue ${fmtETB(station.revenue)}  ·  Svc ${fmtETB(station.serviceCharge)}  ·  Total ${fmtETB(total)}`);

    if (station.routes.size === 0) {
      doc.font("Helvetica-Oblique").fontSize(10).fillColor("#888").text("No activity today.", { indent: 14 });
    } else {
      const sortedRoutes = [...station.routes.entries()].sort(
        (a, b) => b[1].revenue + b[1].serviceCharge - (a[1].revenue + a[1].serviceCharge)
      );
      for (const [arrival, route] of sortedRoutes) {
        const routeTotal = route.revenue + route.serviceCharge;
        doc
          .font("Helvetica")
          .fontSize(10.5)
          .fillColor("#222")
          .text(`-> ${arrival}   Rev ${fmtETB(route.revenue)}  ·  Svc ${fmtETB(route.serviceCharge)}  ·  Total ${fmtETB(routeTotal)}`, { indent: 14 });
        const workedBy = [...route.ticketers.values()]
          .sort((a, b) => b.revenue + b.serviceCharge - (a.revenue + a.serviceCharge))
          .map((t) => `${t.name} (${fmtETB(t.revenue + t.serviceCharge)})`)
          .join(", ");
        doc.font("Helvetica-Oblique").fontSize(9).fillColor("#666").text(`Worked by: ${workedBy}`, { indent: 28 });
      }
    }
    doc.moveDown(0.7);
  }
}

// Company-wide PDF — every one of the 16 departure terminals, at zero if
// idle that day, mirroring buildServiceChargeBreakdownReport's text.
export async function buildDailyFinancialPdf(
  date: Date,
  stations: Map<string, StationBucket>,
  grandRevenue: number,
  grandServiceCharge: number
): Promise<Buffer> {
  const sorted = sortStationEntries([...stations.entries()]);
  return collectPdfBuffer((doc) => renderReport(doc, "Daily Financial Report", fmtDateLabel(date), sorted, grandRevenue, grandServiceCharge));
}

// Single-station PDF for a station-scoped recipient — same layout, one
// station only, so a scoped cashier's attachment never contains another
// station's figures.
export async function buildStationFinancialPdf(date: Date, stationName: string, station: StationBucket): Promise<Buffer> {
  return collectPdfBuffer((doc) =>
    renderReport(doc, `${stationName} — Daily Financial Report`, fmtDateLabel(date), [[stationName, station]], station.revenue, station.serviceCharge)
  );
}

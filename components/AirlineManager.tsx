import React, { useState, useEffect, useRef } from "react";
import { Airline, Flight, ShiftConfig } from "../types";
import { db } from "../services/supabaseService";
import { Plus, Trash2, Edit3, Plane, Upload, Download } from "lucide-react";
import * as XLSX from "xlsx";

interface Props {
  flights?: Flight[];
  shifts?: ShiftConfig[];
  startDate?: string;
  endDate?: string;
}

export const AirlineManager: React.FC<Props> = ({ flights = [], shifts = [], startDate, endDate }) => {
  const [airlines, setAirlines] = useState<Airline[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAirline, setNewAirline] = useState({ name: "", iata_code: "" });

  const loadAirlines = async () => {
    setLoading(true);
    const data = await db.getAirlines();
    setAirlines(data);
    setLoading(false);
  };

  useEffect(() => {
    loadAirlines();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAirline.name || !newAirline.iata_code) return;
    
    await db.addAirline({
      name: newAirline.name,
      iata_code: newAirline.iata_code.toUpperCase(),
    });
    setNewAirline({ name: "", iata_code: "" });
    loadAirlines();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this airline?")) {
      await db.deleteAirline(id);
      loadAirlines();
    }
  };

  const getFlightCount = (iata: string) => {
    if (!flights.length) return 0;
    return flights.filter(f => {
      const matchIata = (f.flightNumber || "").toUpperCase().includes(iata.toUpperCase());
      if (!matchIata) return false;
      
      if (startDate && endDate) {
        if (!f.date) return false;
        const fDate = new Date(f.date);
        const sDate = new Date(startDate);
        const eDate = new Date(endDate);
        return fDate >= sDate && fDate <= eDate;
      }
      return true;
    }).length;
  };

  const handleExportAirline = async (airline: Airline) => {
    if (!flights || !flights.length) return;
    
    // Get all flights for this airline that fall within the selected period
    const airlineFlights = flights.filter(f => {
      const matchIata = (f.flightNumber || "").toUpperCase().includes((airline.iata_code || "").toUpperCase());
      if (!matchIata) return false;
      
      if (startDate && endDate) {
        if (!f.date) return false;
        const fDate = new Date(f.date);
        const sDate = new Date(startDate);
        const eDate = new Date(endDate);
        return fDate >= sDate && fDate <= eDate;
      }
      return true;
    });

    if (airlineFlights.length === 0) {
      alert("No flights found for this airline in the selected period.");
      return;
    }
    
    const ExcelJS = await import("exceljs");
    const { saveAs } = await import("file-saver");
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Weekly Program");

    const startDateObj = startDate ? new Date(startDate) : new Date();
    const endDateObj = endDate ? new Date(endDate) : new Date(startDateObj.getTime() + 7 * 24 * 60 * 60 * 1000);
    const formattedStartDate = `${startDateObj.getDate().toString().padStart(2, '0')} / ${startDateObj.toLocaleString('default', { month: 'short' }).toUpperCase()} / ${startDateObj.getFullYear()}`;
    const formattedEndDate = `${endDateObj.getDate().toString().padStart(2, '0')} / ${endDateObj.toLocaleString('default', { month: 'short' }).toUpperCase()} / ${endDateObj.getFullYear()}`;

    const isNesma = airline.iata_code.toUpperCase() === "SM";
    
    const commonBorderStyle = {
      top: { style: "thin", color: { argb: "FF000080" } },
      left: { style: "thin", color: { argb: "FF000080" } },
      bottom: { style: "thin", color: { argb: "FF000080" } },
      right: { style: "thin", color: { argb: "FF000080" } }
    } as any;

    let rowIdx = 1;

    if (isNesma) {
      sheet.getColumn(1).width = 5;
      sheet.getColumn(2).width = 18;
      sheet.getColumn(3).width = 12;
      sheet.getColumn(4).width = 10;
      sheet.getColumn(5).width = 10;
      sheet.getColumn(6).width = 10;
      sheet.getColumn(7).width = 10;
      sheet.getColumn(8).width = 10;
      sheet.getColumn(9).width = 10;

      const titleRow = sheet.addRow([`${airline.iata_code} Weekly Program From ${formattedStartDate} Till ${formattedEndDate}`]);
      sheet.mergeCells(`A${rowIdx}:I${rowIdx}`);
      titleRow.font = { bold: true, color: { argb: "FF000080" }, size: 10 };
      titleRow.alignment = { horizontal: "center", vertical: "middle" };
      titleRow.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: "FFC9DAF8" } }; c.border = commonBorderStyle; });
      rowIdx++;

      const verRow = sheet.addRow(["VER. (02)"]);
      sheet.mergeCells(`A${rowIdx}:I${rowIdx}`);
      verRow.font = { bold: true, color: { argb: "FF000080" }, size: 10 };
      verRow.alignment = { horizontal: "center", vertical: "middle" };
      verRow.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: "FFEFEFEF" } }; c.border = commonBorderStyle; });
      rowIdx++;

      const h1Row = sheet.addRow(["SDU ( HMB )", "", "", "FROM", "Local Time", "", "", "", "To"]);
      sheet.mergeCells(`A${rowIdx}:C${rowIdx}`);
      sheet.mergeCells(`E${rowIdx}:H${rowIdx}`);
      h1Row.font = { bold: true, color: { argb: "FF000080" }, size: 10 };
      h1Row.alignment = { horizontal: "center", vertical: "middle" };
      h1Row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: "FFC9DAF8" } }; c.border = commonBorderStyle; });
      rowIdx++;

      const h2Row = sheet.addRow(["S/N", "Flight No/Day", "REG", "FROM", "STA", "ETA", "STD", "ETD", "To"]);
      h2Row.font = { bold: true, color: { argb: "FF000080" }, size: 10 };
      h2Row.alignment = { horizontal: "center", vertical: "middle" };
      h2Row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: "FFC9DAF8" } }; c.border = commonBorderStyle; });
      rowIdx++;

    } else {
      sheet.getColumn(1).width = 5;
      sheet.getColumn(2).width = 18;
      sheet.getColumn(3).width = 12;
      sheet.getColumn(4).width = 12;
      sheet.getColumn(5).width = 12;
      sheet.getColumn(6).width = 12;

      const titleRow = sheet.addRow([`${airline.iata_code} Weekly Program From ${formattedStartDate} Till ${formattedEndDate} V 01`]);
      sheet.mergeCells(`A${rowIdx}:F${rowIdx}`);
      titleRow.font = { bold: true, color: { argb: "FF000080" }, size: 10 };
      titleRow.alignment = { horizontal: "center", vertical: "middle" };
      titleRow.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: "FFFCE5CD" } }; c.border = commonBorderStyle; });
      rowIdx++;

      const h1Row = sheet.addRow(["SDU ( HMB )", "", "FROM", "Local Time", "", "To"]);
      sheet.mergeCells(`A${rowIdx}:B${rowIdx}`);
      sheet.mergeCells(`D${rowIdx}:E${rowIdx}`);
      h1Row.font = { bold: true, color: { argb: "FF000080" }, size: 10 };
      h1Row.alignment = { horizontal: "center", vertical: "middle" };
      h1Row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: "FFC9DAF8" } }; c.border = commonBorderStyle; });
      rowIdx++;

      const h2Row = sheet.addRow(["S/N", "Flight No/Day", "FROM", "STA", "STD", "To"]);
      h2Row.font = { bold: true, color: { argb: "FF000080" }, size: 10 };
      h2Row.alignment = { horizontal: "center", vertical: "middle" };
      h2Row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: "FFC9DAF8" } }; c.border = commonBorderStyle; });
      rowIdx++;
    }

    const activeDates: string[] = [];
    const currDate = new Date(startDateObj);
    while (currDate <= endDateObj) {
      activeDates.push(currDate.toISOString().split('T')[0]);
      currDate.setDate(currDate.getDate() + 1);
    }
    
    const flightsByDate = new Map<string, any[]>();
    activeDates.forEach(d => flightsByDate.set(d, []));

    airlineFlights.forEach(f => {
      const fDate = f.date || "";
      if (flightsByDate.has(fDate)) {
        // Check if there is any shift assigned to this flight
        const linkedShifts = shifts?.filter(s => s.flightIds?.includes(f.id)) || [];
        
        // Only include flight if it is linked to a shift in the staff sheet
        if (linkedShifts.length > 0) {
          const isCancelled = linkedShifts.every(s => (s.description || "").toUpperCase().includes("CANCEL"));
          flightsByDate.get(fDate)!.push({ ...f, isCancelled });
        }
      }
    });

    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    
    activeDates.forEach(dateStr => {
      const uniqueFlights = flightsByDate.get(dateStr) || [];
      
      uniqueFlights.sort((a, b) => {
        const timeA = a.sta || a.std || "";
        const timeB = b.sta || b.std || "";
        return timeA.localeCompare(timeB);
      });

      const d = new Date(dateStr);
      const dayStr = `${daysOfWeek[d.getDay()]} ${d.getDate().toString().padStart(2, '0')}-${d.toLocaleString('default', { month: 'short' }).toUpperCase()}-${d.getFullYear().toString().substr(2)}`;
      
      const dayRow = sheet.addRow([dayStr]);
      if (isNesma) {
        sheet.mergeCells(`A${rowIdx}:I${rowIdx}`);
      } else {
        sheet.mergeCells(`A${rowIdx}:F${rowIdx}`);
      }
      dayRow.font = { bold: true, color: { argb: "FF000080" }, size: 10 };
      dayRow.alignment = { horizontal: "left", vertical: "middle" };
      dayRow.eachCell((c) => { 
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isNesma ? "FFC9DAF8" : "FFFFF2CC" } }; 
        c.border = commonBorderStyle; 
      });
      rowIdx++;

      if (uniqueFlights.length === 0) {
         let nilRow;
         if (isNesma) {
           nilRow = sheet.addRow([1, "NIL", "NIL", "NIL", "NIL", "NIL", "NIL", "NIL", "NIL"]);
         } else {
           nilRow = sheet.addRow([1, "NIL", "NIL", "NIL", "NIL", "NIL"]);
         }
         nilRow.font = { bold: true, color: { argb: "FF000080" }, size: 10 };
         nilRow.alignment = { horizontal: "center", vertical: "middle" };
         nilRow.eachCell((c) => { 
           c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: "FFFFFFFF" } }; 
           c.border = commonBorderStyle; 
         });
         rowIdx++;
      } else {
        let sn = 1;
        uniqueFlights.forEach(f => {
          let dataRow;
          const formattedFlightNumber = f.flightNumber ? f.flightNumber.replace("/", " / ") : "";

          if (isNesma) {
             dataRow = sheet.addRow([
               sn++,
               formattedFlightNumber,
               "SUBUU",
               f.from,
               f.isCancelled ? "CANCELLED" : (f.sta ? f.sta : "***"),
               f.isCancelled ? "CANCELLED" : (f.eta || ""),
               f.isCancelled ? "CANCELLED" : (f.std ? f.std : "***"),
               f.isCancelled ? "CANCELLED" : (f.etd || ""),
               f.to
             ]);
          } else {
             dataRow = sheet.addRow([
               sn++,
               formattedFlightNumber,
               f.from,
               f.isCancelled ? "CANCELLED" : (f.sta || ""),
               f.isCancelled ? "CANCELLED" : (f.std || ""),
               f.to
             ]);
          }
          
          dataRow.font = { bold: true, color: { argb: "FF000080" }, size: 10 };
          dataRow.alignment = { horizontal: "center", vertical: "middle" };
          dataRow.eachCell((c) => { 
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: f.isCancelled ? "FFFF0000" : "FFFFFFFF" } }; 
            c.border = commonBorderStyle; 
          });
          rowIdx++;
        });
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${airline.name}_Weekly_Program.xlsx`);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-mono text-xs uppercase tracking-widest">Loading airlines...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in zoom-in-95 duration-300">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black italic tracking-tight text-slate-900 uppercase flex items-center gap-2">
            <Plane className="w-6 h-6 text-blue-600" />
            Airlines Directory
          </h2>
          <p className="text-sm text-slate-500 font-medium">
            Manage airline profiles to automatically identify flights via IATA call signs and track flight volume.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-8">
        <div className="bg-slate-50 border-b border-slate-200 p-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Add New Airline</h3>
        </div>
        <form onSubmit={handleAdd} className="p-4 flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1 tracking-wider">Airline Name</label>
            <input
              type="text"
              placeholder="e.g. Aircairo"
              value={newAirline.name}
              onChange={(e) => setNewAirline({ ...newAirline, name: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 text-sm font-medium px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              required
            />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1 tracking-wider">IATA Call Sign</label>
            <input
              type="text"
              placeholder="e.g. SM"
              value={newAirline.iata_code}
              onChange={(e) => setNewAirline({ ...newAirline, iata_code: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 text-sm font-mono font-bold px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all uppercase"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add Airline
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="grid grid-cols-12 gap-4 p-4 bg-slate-50 border-b border-slate-200 items-center">
          <div className="col-span-5 text-[10px] font-black uppercase text-slate-500 tracking-wider">Airline Name</div>
          <div className="col-span-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">Call Sign</div>
          <div className="col-span-2 text-center text-[10px] font-black uppercase text-slate-500 tracking-wider">Period Flights</div>
          <div className="col-span-2 text-right text-[10px] font-black uppercase text-slate-500 tracking-wider">Actions</div>
        </div>
        <div className="divide-y divide-slate-100">
          {airlines.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400 font-medium italic">No airlines configured yet.</div>
          ) : (
            airlines.map((airline) => {
              const count = getFlightCount(airline.iata_code);
              return (
                <div key={airline.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-slate-50 transition-colors">
                  <div className="col-span-5 font-semibold text-slate-900">{airline.name}</div>
                  <div className="col-span-3">
                    <span className="inline-flex items-center justify-center bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-bold font-mono">
                      {airline.iata_code}
                    </span>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-xs font-black ${count > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {count}
                    </span>
                  </div>
                  <div className="col-span-2 flex justify-end gap-2">
                    <button
                      onClick={() => handleExportAirline(airline)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Export Weekly Program"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(airline.id)}
                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete Airline"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};


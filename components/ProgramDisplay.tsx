
import React, { useState } from 'react';
import { DailyProgram, Flight, Staff, ShiftConfig, LeaveRequest, IncomingDuty, Skill } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  FileDown, 
  CalendarDays, 
  Users, 
  Plane, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  MapPin,
  Printer,
  Clock
} from 'lucide-react';
import { DAYS_OF_WEEK_FULL, AVAILABLE_SKILLS } from '../constants';

interface Props {
  programs: DailyProgram[];
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  leaveRequests: LeaveRequest[];
  incomingDuties: IncomingDuty[];
  startDate: string;
  endDate: string;
  stationHealth: number;
  alerts: { type: 'danger' | 'warning', message: string }[];
  minRestHours: number;
  onUpdatePrograms: (p: DailyProgram[]) => void;
}

export const ProgramDisplay: React.FC<Props> = ({ 
  programs, 
  flights, 
  staff, 
  shifts, 
  leaveRequests, 
  incomingDuties,
  startDate, 
  endDate,
  stationHealth,
  minRestHours
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const getStaff = (id: string) => staff.find(s => s.id === id);
  const getFlight = (id: string) => flights.find(f => f.id === id);
  const getShift = (id: string) => shifts.find(s => s.id === id);

  // --- HELPER: Calculate Rest Hours ---
  const calculateRestHours = (staffId: string, currentShiftStart: Date): number | null => {
    let lastEndTime: Date | null = null;

    // 1. Check Incoming Duties (Log)
    const staffIncoming = incomingDuties.filter(d => d.staffId === staffId);
    staffIncoming.forEach(d => {
        const dt = new Date(`${d.date}T${d.shiftEndTime}`);
        if (dt < currentShiftStart && (!lastEndTime || dt > lastEndTime)) {
            lastEndTime = dt;
        }
    });

    // 2. Check Previous Program Assignments
    programs.forEach(p => {
        p.assignments.filter(a => a.staffId === staffId).forEach(a => {
            const s = getShift(a.shiftId || '');
            if (s) {
               const pDate = new Date(p.dateString || startDate);
               const [sh, sm] = s.endTime.split(':').map(Number);
               const [ph, pm] = s.pickupTime.split(':').map(Number);
               
               const endDt = new Date(pDate);
               endDt.setHours(sh, sm, 0, 0);
               // Handle overnight
               if (sh < ph) endDt.setDate(endDt.getDate() + 1);

               if (endDt < currentShiftStart && (!lastEndTime || endDt > lastEndTime)) {
                   lastEndTime = endDt;
               }
            }
        });
    });

    if (!lastEndTime) return null;
    const diffMs = currentShiftStart.getTime() - (lastEndTime as Date).getTime();
    return parseFloat((diffMs / (1000 * 60 * 60)).toFixed(1));
  };

  const generateFullReport = () => {
    setIsGeneratingPdf(true);
    const doc = new jsPDF('l', 'mm', 'a4');
    
    // STRICT DATE FILTER: Only process programs within the selected range
    const activePrograms = programs.filter(p => {
        if (!p.dateString) return false;
        return p.dateString >= startDate && p.dateString <= endDate;
    }).sort((a,b) => (a.dateString || '').localeCompare(b.dateString || ''));

    // --- 1. DAILY PROGRAM PAGES ---
    activePrograms.forEach((prog, index) => {
      if (index > 0) doc.addPage();
      
      const currentDate = new Date(prog.dateString || startDate);
      const dateStr = `${DAYS_OF_WEEK_FULL[currentDate.getDay()].toUpperCase()} - ${currentDate.getDate()}/${currentDate.getMonth()+1}/${currentDate.getFullYear()}`;

      // Header
      doc.setFillColor(255, 255, 255);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text("SkyOPS Station Handling Program", 14, 15);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Target Period: ${startDate} to ${endDate}`, 14, 22);

      let contentStartY = 35;

      // --- REST LOG TABLE (Inserted on First Page Only) ---
      // FILTER: Only show duties from the last 48 hours relative to Start Date
      if (index === 0) {
          const groupedMap = new Map<string, string[]>(); 
          
          incomingDuties.forEach(d => {
              // Date Check: Is this duty relevant? (e.g. within 2 days before start)
              const dDate = new Date(d.date);
              const sDate = new Date(startDate);
              const diffTime = sDate.getTime() - dDate.getTime();
              const diffDays = diffTime / (1000 * 3600 * 24);
              
              if (diffDays >= 0 && diffDays <= 2) {
                  const key = `${d.date}|${d.shiftEndTime}`;
                  const st = getStaff(d.staffId);
                  if (st) {
                      const existing = groupedMap.get(key) || [];
                      existing.push(st.initials);
                      groupedMap.set(key, existing);
                  }
              }
          });

          const sortedKeys = Array.from(groupedMap.keys()).sort();

          if (sortedKeys.length > 0) {
              const restRows = sortedKeys.map((key, i) => {
                  const [dDate, dTime] = key.split('|');
                  const endDt = new Date(`${dDate}T${dTime}`);
                  const releaseDt = new Date(endDt.getTime() + minRestHours * 60 * 60 * 1000);
                  
                  const isPrevDay = new Date(dDate) < new Date(startDate);
                  const dateLabel = isPrevDay ? "Prev Day" : `${endDt.getDate()}/${endDt.getMonth()+1}`;
                  
                  const releaseDateLabel = releaseDt.getDate() !== endDt.getDate() 
                      ? (releaseDt.getDate() === new Date(startDate).getDate() ? "" : `${releaseDt.getDate()}/${releaseDt.getMonth()+1}`)
                      : ""; 

                  const initials = groupedMap.get(key)?.join(' - ');
                  const hc = groupedMap.get(key)?.length || 0;

                  return [
                      (i + 1).toString(),
                      `${dTime} (${dateLabel})`,
                      `${releaseDt.getHours().toString().padStart(2,'0')}:${releaseDt.getMinutes().toString().padStart(2,'0')} ${releaseDateLabel}`,
                      hc.toString(),
                      initials
                  ];
              });

              doc.setFontSize(9);
              doc.setFont('helvetica', 'bold');
              doc.text("PREVIOUS DAY SHIFTS (INCOMING HANDOVER)", 14, contentStartY - 2);

              autoTable(doc, {
                  startY: contentStartY,
                  head: [['S/N', 'SHIFT END', 'RELEASE', 'HC', 'PERSONNEL (REST LOG)']],
                  body: restRows,
                  theme: 'grid',
                  headStyles: { 
                      fillColor: [255, 204, 0], // Yellow Header
                      textColor: [0, 0, 0],
                      fontStyle: 'bold',
                      fontSize: 8,
                      lineWidth: 0.1,
                      lineColor: [0, 0, 0]
                  },
                  styles: { 
                      fontSize: 8, 
                      cellPadding: 1.5,
                      textColor: [0, 0, 0],
                      lineColor: [0, 0, 0],
                      lineWidth: 0.1,
                      fillColor: [255, 255, 235], // Very Light Yellow Body
                      valign: 'middle'
                  },
                  columnStyles: {
                      0: { cellWidth: 10, halign: 'center' },
                      1: { cellWidth: 35 },
                      2: { cellWidth: 35 },
                      3: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
                      4: { cellWidth: 'auto' }
                  },
                  margin: { left: 14, right: 14 }
              });
              contentStartY = (doc as any).lastAutoTable.finalY + 10;
          }
      }

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(dateStr, 14, contentStartY);

      // Main Table Data
      const shiftsToday = shifts.filter(s => s.pickupDate === prog.dateString);
      const tableData = shiftsToday.map((shift, idx) => {
        const assignments = prog.assignments.filter(a => a.shiftId === shift.id);
        
        // Build Flight String (Just Number)
        const flightStrs = (shift.flightIds || []).map(fid => {
           const f = getFlight(fid);
           return f ? f.flightNumber : '';
        }).filter(Boolean).join(' / ') || 'NIL';

        // Build Personnel String
        const personnelStrs = assignments.map(a => {
           const st = getStaff(a.staffId);
           if (!st) return '';
           return `${st.initials} (${a.role})`;
        }).join(' | ');

        return [
           (idx + 1).toString(),
           shift.pickupTime,
           shift.endTime,
           flightStrs,
           `${assignments.length} / ${shift.maxStaff}`,
           personnelStrs
        ];
      });

      autoTable(doc, {
        startY: contentStartY + 5,
        head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC / MAX', 'PERSONNEL & ASSIGNED ROLES']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 20 },
            2: { cellWidth: 20 },
            3: { cellWidth: 25 },
            4: { cellWidth: 20, halign: 'center' },
            5: { cellWidth: 'auto' }
        }
      });

      // Absence Registry
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      if (finalY > 180) {
          doc.addPage();
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text("ABSENCE AND REST REGISTRY", 14, finalY);

      // Categorize Staff
      const workingIds = new Set(prog.assignments.map(a => a.staffId));
      const offStaff = staff.filter(s => !workingIds.has(s.id));

      const categories: Record<string, string[]> = {
         'DAYS OFF': [],
         'ROSTER LEAVE': [],
         'ANNUAL LEAVE': [],
         'STANDBY (RESERVE)': []
      };

      offStaff.forEach(s => {
         const leave = leaveRequests.find(l => l.staffId === s.id && l.startDate <= prog.dateString! && l.endDate >= prog.dateString!);
         
         // Counter Logic
         let count = 1; 
         for (let i = index - 1; i >= 0; i--) {
             const prevProg = activePrograms[i];
             const worked = prevProg.assignments.some(a => a.staffId === s.id);
             const prevLeave = leaveRequests.find(l => l.staffId === s.id && l.startDate <= prevProg.dateString! && l.endDate >= prevProg.dateString!);
             
             if (!worked) {
                if (leave && prevLeave && prevLeave.type === leave.type) count++;
                else if (!leave && !prevLeave) count++;
                else break; 
             } else {
                 break;
             }
         }
         
         const label = `${s.initials} (${count})`;

         // Check if Roster staff is out of contract window
         const isRosterOutOfContract = s.type === 'Roster' && s.workFromDate && s.workToDate && (prog.dateString! < s.workFromDate || prog.dateString! > s.workToDate);

         if (isRosterOutOfContract) {
             categories['ROSTER LEAVE'].push(label);
         } else if (leave) {
            if (leave.type === 'Annual leave') categories['ANNUAL LEAVE'].push(label);
            else if (leave.type === 'Roster leave') categories['ROSTER LEAVE'].push(label);
            else if (leave.type === 'Day off') categories['DAYS OFF'].push(label);
            else categories['DAYS OFF'].push(label);
         } else {
            const yesterdayProg = activePrograms[index - 1];
            let workedYesterday = false;
            if (yesterdayProg) workedYesterday = yesterdayProg.assignments.some(a => a.staffId === s.id);
            
            if (workedYesterday) {
               // Resting
            }
            else if (s.type === 'Local') categories['DAYS OFF'].push(label);
            else categories['STANDBY (RESERVE)'].push(label);
         }
      });

      const registryData = [
         ['DAYS OFF', categories['DAYS OFF'].join(', ')],
         ['ROSTER LEAVE', categories['ROSTER LEAVE'].join(', ')],
         ['ANNUAL LEAVE', categories['ANNUAL LEAVE'].join(', ')],
         ['STANDBY (RESERVE)', categories['STANDBY (RESERVE)'].join(', ')]
      ];

      autoTable(doc, {
        startY: finalY + 2,
        head: [['STATUS CATEGORY', 'PERSONNEL INITIALS']],
        body: registryData,
        theme: 'grid',
        headStyles: { fillColor: [50, 50, 60], textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } }
      });
    });

    // --- 2. WEEKLY AUDIT (LOCAL) ---
    doc.addPage();
    doc.setFontSize(16);
    doc.text("Weekly Personnel Utilization Audit (Local)", 14, 15);
    
    const localStaff = staff.filter(s => s.type === 'Local');
    const localAuditData = localStaff.map((s, idx) => {
        const shiftsWorked = activePrograms.reduce((acc, p) => acc + (p.assignments.some(a => a.staffId === s.id) ? 1 : 0), 0);
        const daysOff = activePrograms.length - shiftsWorked;
        const targetShifts = 5; 
        const targetOff = 2;
        const isMatch = shiftsWorked === targetShifts && daysOff === targetOff; 
        
        return [
            (idx + 1).toString(),
            s.name,
            s.initials,
            shiftsWorked.toString(),
            daysOff.toString(),
            isMatch ? 'MATCH' : 'CHECK'
        ];
    });

    autoTable(doc, {
        startY: 20,
        head: [['S/N', 'NAME', 'INIT', 'WORK SHIFTS', 'OFF DAYS', 'STATUS']],
        body: localAuditData,
        theme: 'striped',
        headStyles: { fillColor: [0, 0, 0] },
        styles: { fontSize: 9, halign: 'center' },
        columnStyles: { 1: { halign: 'left' } },
        didParseCell: (data) => {
            if (data.section === 'body') {
                const status = data.row.raw[5];
                if (status === 'MATCH') {
                    data.cell.styles.fillColor = [22, 163, 74];
                    data.cell.styles.textColor = [255, 255, 255];
                } else if (status === 'CHECK') {
                    data.cell.styles.fillColor = [220, 38, 38];
                    data.cell.styles.textColor = [255, 255, 255];
                }
            }
        }
    });

    // --- 3. WEEKLY AUDIT (ROSTER) ---
    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(0,0,0);
    doc.text("Weekly Personnel Utilization Audit (Roster)", 14, 15);

    const rosterStaff = staff.filter(s => s.type === 'Roster');
    const rosterAuditData = rosterStaff.map((s, idx) => {
        const shiftsWorked = activePrograms.reduce((acc, p) => acc + (p.assignments.some(a => a.staffId === s.id) ? 1 : 0), 0);
        const progStart = new Date(startDate);
        const progEnd = new Date(endDate);
        const workFrom = s.workFromDate ? new Date(s.workFromDate) : progStart;
        const workTo = s.workToDate ? new Date(s.workToDate) : progEnd;
        
        const overlapStart = workFrom > progStart ? workFrom : progStart;
        const overlapEnd = workTo < progEnd ? workTo : progEnd;
        
        let potential = 0;
        if (overlapStart <= overlapEnd) {
             potential = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        }

        const isMatch = shiftsWorked === potential;

        return [
            (idx + 1).toString(),
            s.name,
            s.initials,
            s.workFromDate || 'N/A',
            s.workToDate || 'N/A',
            potential.toString(),
            shiftsWorked.toString(),
            isMatch ? 'MATCH' : 'CHECK'
        ];
    });

    autoTable(doc, {
        startY: 20,
        head: [['S/N', 'NAME', 'INIT', 'WORK FROM', 'WORK TO', 'POTENTIAL', 'ACTUAL', 'STATUS']],
        body: rosterAuditData,
        theme: 'striped',
        headStyles: { fillColor: [0, 0, 0] },
        styles: { fontSize: 9, halign: 'center' },
        columnStyles: { 1: { halign: 'left' } },
        didParseCell: (data) => {
            if (data.section === 'body') {
                const status = data.row.raw[7];
                if (status === 'MATCH') {
                    data.cell.styles.fillColor = [22, 163, 74];
                    data.cell.styles.textColor = [255, 255, 255];
                } else if (status === 'CHECK') {
                    data.cell.styles.fillColor = [220, 38, 38];
                    data.cell.styles.textColor = [255, 255, 255];
                }
            }
        }
    });

    // --- 4. OPERATIONS MATRIX VIEW ---
    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(0,0,0);
    doc.text("Weekly Operations Matrix View", 14, 15);

    const dateHeaders = activePrograms.map(p => {
        const d = new Date(p.dateString || startDate);
        return `${d.getDate()}/${d.getMonth()+1}`;
    });
    
    const matrixHead = [['S/N', 'AGENT', ...dateHeaders, 'AUDIT']];
    const matrixBody = staff.map((s, idx) => {
        const row = [(idx + 1).toString(), `${s.initials} (${s.type === 'Local' ? 'L' : 'R'})`];
        let workedCount = 0;
        activePrograms.forEach(p => {
            const assign = p.assignments.find(a => a.staffId === s.id);
            if (assign) {
                workedCount++;
                const shift = getShift(assign.shiftId || '');
                if (shift) {
                    const pDate = new Date(p.dateString!);
                    const [ph, pm] = shift.pickupTime.split(':').map(Number);
                    const shiftStart = new Date(pDate);
                    shiftStart.setHours(ph, pm, 0, 0);
                    const rest = calculateRestHours(s.id, shiftStart);
                    const restLabel = rest !== null ? `[${rest.toFixed(1)}H]` : '';
                    row.push(`${shift.pickupTime} ${restLabel}`);
                } else {
                    row.push('ERR');
                }
            } else {
                row.push('-');
            }
        });
        row.push(`${workedCount}/${activePrograms.length}`);
        return row;
    });

    autoTable(doc, {
        startY: 20,
        head: matrixHead,
        body: matrixBody,
        theme: 'grid',
        headStyles: { fillColor: [220, 100, 0] },
        styles: { fontSize: 7, halign: 'center', cellPadding: 1.5 },
        columnStyles: { 1: { halign: 'left', fontStyle: 'bold' } },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index > 1 && data.column.index < dateHeaders.length + 2) {
                const text = data.cell.raw as string;
                if (text && text.includes('[')) {
                    const match = text.match(/\[([\d.]+)H\]/);
                    if (match) {
                        const rest = parseFloat(match[1]);
                        if (rest < minRestHours) {
                            data.cell.styles.fillColor = [220, 38, 38];
                            data.cell.styles.textColor = [255, 255, 255];
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                }
            }
        }
    });

    // --- 5. SPECIALIST ROLE FULFILLMENT MATRIX ---
    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(0,0,0);
    doc.text("Specialist Role Fulfillment Matrix", 14, 15);

    const roleMatrixData: any[] = [];
    const roleMatrixMeta: any[] = [];
    
    activePrograms.forEach(p => {
        const d = new Date(p.dateString || startDate);
        const dateLabel = `${d.getDate()}/${d.getMonth()+1}`;
        const shiftsToday = shifts.filter(s => s.pickupDate === p.dateString);
        
        shiftsToday.forEach(s => {
            const assignments = p.assignments.filter(a => a.shiftId === s.id);
            
            // Helper to check if a staff member covers a role with Dual Logic
            const coversRole = (a: any, targetRole: string) => {
                const st = getStaff(a.staffId);
                if (!st) return false;
                
                // 1. Direct Assignment (Standard Codes)
                const roleCode = targetRole === 'Shift Leader' ? 'SL' : 
                                 targetRole === 'Load Control' ? 'LC' : 
                                 targetRole === 'Ramp' ? 'RMP' : 
                                 targetRole === 'Operations' ? 'OPS' : 
                                 targetRole === 'Lost and Found' ? 'LF' : targetRole;
                                 
                if (a.role === roleCode || a.role === targetRole) return true;

                // 2. Dual Role Logic (SL Covers LC, LC Covers SL)
                if (targetRole === 'Load Control' && (a.role === 'SL' || a.role === 'Shift Leader') && st.isLoadControl) return true;
                if (targetRole === 'Shift Leader' && (a.role === 'LC' || a.role === 'Load Control') && st.isShiftLeader) return true;

                return false;
            };

            const getStaffForRole = (role: string) => {
                return assignments
                    .filter(a => coversRole(a, role))
                    .map(a => getStaff(a.staffId)?.initials)
                    .filter(Boolean)
                    .join(', ');
            };

            const sl = getStaffForRole('Shift Leader');
            const lc = getStaffForRole('Load Control');
            const rmp = getStaffForRole('Ramp');
            const ops = getStaffForRole('Operations');
            const lf = getStaffForRole('Lost and Found');
            
            roleMatrixData.push([
                dateLabel,
                `${s.pickupTime}-${s.endTime}`,
                sl,
                lc,
                rmp,
                ops,
                lf
            ]);

            roleMatrixMeta.push({
                slReq: (s.roleCounts?.['Shift Leader'] || 0) > 0,
                lcReq: (s.roleCounts?.['Load Control'] || 0) > 0,
                rmpReq: (s.roleCounts?.['Ramp'] || 0) > 0,
                opsReq: (s.roleCounts?.['Operations'] || 0) > 0,
                lfReq: (s.roleCounts?.['Lost and Found'] || 0) > 0
            });
        });
    });

    autoTable(doc, {
        startY: 20,
        head: [['DATE', 'SHIFT', 'SL', 'LC', 'RMP', 'OPS', 'LF']],
        body: roleMatrixData,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0] },
        styles: { fontSize: 7, halign: 'center', valign: 'middle', cellPadding: 1.5 },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index > 1) {
                const rowIndex = data.row.index;
                const meta = roleMatrixMeta[rowIndex];
                if (!meta) return;

                const colIdx = data.column.index;
                let isRequired = false;
                if (colIdx === 2) isRequired = meta.slReq;
                if (colIdx === 3) isRequired = meta.lcReq;
                if (colIdx === 4) isRequired = meta.rmpReq;
                if (colIdx === 5) isRequired = meta.opsReq;
                if (colIdx === 6) isRequired = meta.lfReq;

                const content = data.cell.raw as string;
                const hasContent = content && content.length > 0;

                if (hasContent) {
                    data.cell.styles.fillColor = [22, 163, 74]; // Green
                    data.cell.styles.textColor = [255, 255, 255];
                } else if (isRequired) {
                    data.cell.styles.fillColor = [220, 38, 38]; // Red
                    data.cell.styles.textColor = [255, 255, 255];
                    data.cell.text = ['MISSING'];
                }
            }
        }
    });

    doc.save(`SkyOPS_Full_Report_${startDate}.pdf`);
    setIsGeneratingPdf(false);
  };

  return (
    <div className="space-y-6 md:space-y-12 pb-24 animate-in fade-in duration-500">
      <div className="bg-slate-950 text-white p-6 md:p-14 rounded-3xl md:rounded-[3.5rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 overflow-hidden relative">
        <div className="flex items-center gap-4 md:gap-6 relative z-10 flex-col md:flex-row text-center md:text-left">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <CalendarDays size={24} className="md:w-8 md:h-8" />
          </div>
          <div>
            <h3 className="text-2xl md:text-3xl font-black uppercase italic tracking-tighter text-white leading-none">Master Roster</h3>
            <p className="text-slate-400 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] mt-2">
              Program View & Export
            </p>
          </div>
        </div>
        <div className="flex gap-4 relative z-10">
          <button 
             onClick={generateFullReport} 
             disabled={isGeneratingPdf}
             className="px-8 py-5 bg-white text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-400 hover:text-white transition-all shadow-xl flex items-center gap-3 active:scale-95"
          >
             {isGeneratingPdf ? <Printer size={18} className="animate-spin"/> : <FileDown size={18} />}
             <span>Export PDF Report</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-6 md:p-10 rounded-3xl md:rounded-[3.5rem] shadow-sm border border-slate-100 min-h-[500px]">
         {programs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-slate-300 gap-4">
               <AlertTriangle size={48} />
               <span className="text-xl font-black uppercase italic">No Program Generated Yet</span>
            </div>
         ) : (
            <div className="space-y-12">
               {/* STRICTLY FILTERED DISPLAY LOOP - Fixes 'Old Days' appearing in UI */}
               {programs.filter(p => p.dateString && p.dateString >= startDate && p.dateString <= endDate).sort((a,b) => (a.dateString || '').localeCompare(b.dateString || '')).map((prog, i) => (
                  <div key={i} className="space-y-6">
                     <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
                        <div className="w-10 h-10 bg-slate-950 text-white rounded-xl flex items-center justify-center font-black italic">
                           {i + 1}
                        </div>
                        <h4 className="text-xl font-black italic uppercase text-slate-900">{prog.dateString}</h4>
                     </div>
                     
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {prog.assignments.map(a => {
                           const s = getStaff(a.staffId);
                           const sh = getShift(a.shiftId || '');
                           const f = sh?.flightIds?.[0] ? getFlight(sh.flightIds[0]) : null;
                           if (!s || !sh) return null;
                           
                           return (
                              <div key={a.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                                 <div>
                                    <div className="flex items-center gap-2 mb-1">
                                       <span className="text-xs font-black uppercase text-slate-900">{s.initials}</span>
                                       <span className="px-1.5 py-0.5 bg-slate-200 rounded text-[9px] font-bold uppercase">{a.role}</span>
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-500 flex items-center gap-2">
                                       <Clock size={10} /> {sh.pickupTime} - {sh.endTime}
                                    </div>
                                 </div>
                                 {f && (
                                    <div className="text-right">
                                       <span className="block text-xs font-black italic text-blue-600">{f.flightNumber}</span>
                                       <span className="text-[9px] font-bold text-slate-400">{f.from}-{f.to}</span>
                                    </div>
                                 )}
                              </div>
                           );
                        })}
                     </div>
                  </div>
               ))}
            </div>
         )}
      </div>
    </div>
  );
};

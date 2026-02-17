import { DailyProgram, Flight, Staff, ShiftConfig, Assignment, LeaveType, LeaveRequest, IncomingDuty, Skill } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { repairProgramWithAI, calculateCredits } from '../services/geminiService';
import { 
  FileText, 
  Plane, 
  ShieldCheck, 
  TriangleAlert, 
  CalendarDays, 
  LayoutGrid, 
  List,
  Activity,
  Users,
  CheckCircle2,
  Calendar,
  CircleAlert,
  Coffee,
  Printer,
  ChevronRight,
  UserX,
  Moon,
  ShieldAlert,
  BarChart3,
  Check,
  CalendarRange,
  TrendingUp,
  ShieldAlert as AlertIcon,
  Briefcase,
  Timer,
  Zap,
  Loader2,
  Clock,
  X,
  AlertTriangle,
  Hammer,
  CheckSquare,
  Square,
  AlertCircle
} from 'lucide-react';
import React, { useMemo, useState } from 'react';

interface Props {
  programs: DailyProgram[];
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  leaveRequests?: LeaveRequest[];
  incomingDuties?: IncomingDuty[];
  startDate?: string;
  endDate?: string;
  onUpdatePrograms?: (updatedPrograms: DailyProgram[]) => void;
  stationHealth?: number;
  alerts?: { type: 'danger' | 'warning', message: string }[];
  minRestHours?: number;
}

const getOverlapDays = (start1: Date, end1: Date, start2: Date, end2: Date) => {
  const overlapStart = start1 > start2 ? start1 : start2;
  const overlapEnd = end1 < end2 ? end1 : end2;
  if (overlapStart > overlapEnd) return 0;
  const diffTime = overlapEnd.getTime() - overlapStart.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

export const ProgramDisplay: React.FC<Props> = ({ programs, flights, staff, shifts, leaveRequests = [], incomingDuties = [], startDate, endDate, onUpdatePrograms, stationHealth = 100, alerts = [], minRestHours = 12 }) => {
  const [isRepairing, setIsRepairing] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditViolations, setAuditViolations] = useState<string[]>([]);
  const [selectedViolationIndices, setSelectedViolationIndices] = useState<Set<number>>(new Set());
  
  const filteredPrograms = useMemo(() => {
    if (!Array.isArray(programs)) return [];
    if (!startDate || !endDate) return programs;
    const results = programs.filter(p => p.dateString && p.dateString >= startDate && p.dateString <= endDate);
    results.sort((a, b) => (a.dateString || '').localeCompare(b.dateString || ''));
    const seen = new Set<string>();
    return results.filter(p => {
      const d = p.dateString!;
      if (seen.has(d)) return false;
      seen.add(d);
      return true;
    });
  }, [programs, startDate, endDate]);

  const getStaffById = (id: string) => staff.find(s => s.id === id);
  const getFlightById = (id: string) => flights.find(f => f.id === id);
  const getShiftById = (id?: string) => shifts.find(s => s.id === id);

  const getPreviousShiftEnd = (staffId: string, currentProgramDate: string): Date | null => {
    const currentIdx = filteredPrograms.findIndex(p => p.dateString === currentProgramDate);
    // Look back in current program
    for (let i = currentIdx - 1; i >= 0; i--) {
        const p = filteredPrograms[i];
        const assign = p.assignments.find(a => a.staffId === staffId);
        if (assign) {
            const sh = getShiftById(assign.shiftId);
            if (sh) {
                let baseDate = new Date(p.dateString!);
                const [ph, pm] = sh.pickupTime.split(':').map(Number);
                const [eh, em] = sh.endTime.split(':').map(Number);
                // If end time is smaller than pickup, assume next day
                if (eh < ph) baseDate.setDate(baseDate.getDate() + 1);
                const endStr = baseDate.toISOString().split('T')[0];
                return new Date(`${endStr}T${sh.endTime}:00`);
            }
        }
    }
    // Look back in incoming duties (history)
    const history = incomingDuties
      .filter(d => d.staffId === staffId && d.date < currentProgramDate)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.shiftEndTime || '').localeCompare(a.shiftEndTime || ''));
    if (history.length > 0) return new Date(`${history[0].date}T${history[0].shiftEndTime}:00`);
    return null;
  };

  const calculateRestHours = (staffId: string, dateStr: string, pickupTime: string): number | null => {
    const prevEnd = getPreviousShiftEnd(staffId, dateStr);
    if (!prevEnd) return null;
    const currentStart = new Date(`${dateStr}T${pickupTime}:00`);
    const diffMs = currentStart.getTime() - prevEnd.getTime();
    return diffMs / (1000 * 60 * 60);
  };

  const staffStats = useMemo(() => {
    const stats: Record<string, { work: number, off: number, rosterPotential: number, rosterLeave: number, annualLeave: number, standby: number }> = {};
    staff.forEach(s => stats[s.id] = { work: 0, off: 0, rosterPotential: 0, rosterLeave: 0, annualLeave: 0, standby: 0 });
    if (startDate && endDate) {
      staff.forEach(s => {
        if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
           let potential = 0;
           let curr = new Date(startDate);
           const end = new Date(endDate);
           const sFrom = new Date(s.workFromDate);
           const sTo = new Date(s.workToDate);
           while (curr <= end) {
             if (curr >= sFrom && curr <= sTo) potential++;
             curr.setDate(curr.getDate() + 1);
           }
           stats[s.id].rosterPotential = potential;
        } else {
           stats[s.id].rosterPotential = filteredPrograms.length;
        }
      });
    }
    filteredPrograms.forEach(program => {
       const dStr = program.dateString!;
       const workingIds = new Set(program.assignments.map(a => a.staffId));
       staff.forEach(s => {
          if (workingIds.has(s.id)) stats[s.id].work++;
          else {
             const leave = leaveRequests.find(r => r.staffId === s.id && dStr >= r.startDate && dStr <= r.endDate);
             if (leave) stats[s.id].annualLeave++;
             else if (s.type === 'Roster' && s.workFromDate && s.workToDate && (dStr < s.workFromDate || dStr > s.workToDate)) stats[s.id].rosterLeave++;
             else if (s.type === 'Local') stats[s.id].off++;
             else stats[s.id].standby++;
          }
       });
    });
    return stats;
  }, [filteredPrograms, staff, leaveRequests, startDate, endDate]);

  const getStatusForDay = (s: Staff, dateStr: string, program: DailyProgram): string => {
    const assigned = program.assignments.some(a => a.staffId === s.id);
    if (assigned) return 'WORK';
    
    // Check incoming duties (Resting)
    const restLock = incomingDuties.find(d => d.staffId === s.id && d.date === dateStr);
    if (restLock) return 'RESTING (POST-DUTY)';

    // Check leaves
    const leave = leaveRequests.find(r => r.staffId === s.id && dateStr >= r.startDate && dateStr <= r.endDate);
    if (leave) {
        if (leave.type === 'Day off') return 'DAYS OFF';
        if (leave.type === 'Roster leave') return 'ROSTER LEAVE';
        return 'ANNUAL LEAVE';
    }

    if (s.type === 'Roster') {
         const isOutside = s.workFromDate && s.workToDate && (dateStr < s.workFromDate || dateStr > s.workToDate);
         return isOutside ? 'ROSTER LEAVE' : 'STANDBY (RESERVE)';
    }
    
    return 'DAYS OFF'; 
  };

  const getConsecutiveCount = (s: Staff, currentDateStr: string, category: string): number => {
    let count = 1;
    const d = new Date(currentDateStr);
    
    // Look back up to 30 days
    for (let i = 1; i < 30; i++) { 
        d.setDate(d.getDate() - 1);
        const prevDateStr = d.toISOString().split('T')[0];
        const prevProg = programs.find(p => p.dateString === prevDateStr);
        
        if (!prevProg) break; // End of data or start of program
        
        const prevStatus = getStatusForDay(s, prevDateStr, prevProg);
        if (prevStatus === category) {
            count++;
        } else {
            break;
        }
    }
    return count;
  };

  const getFullRegistryForDay = (program: DailyProgram, includeCounts = false): Record<string, string[]> => {
      const dateStr = program.dateString;
      if (!dateStr) return {};
      const assignedIds = new Set(program.assignments.map(a => a.staffId));
      const registryGroups: Record<string, string[]> = {
         'RESTING (POST-DUTY)': [],
         'DAYS OFF': [],
         'ROSTER LEAVE': [],
         'ANNUAL LEAVE': [],
         'STANDBY (RESERVE)': []
      };
      
      staff.forEach(s => {
         if (assignedIds.has(s.id)) return;
         const restLock = incomingDuties.find(d => d.staffId === s.id && d.date === dateStr);
         const leave = leaveRequests.find(r => r.staffId === s.id && dateStr >= r.startDate && dateStr <= r.endDate);
         
         let category = '';
         if (leave) {
            if (leave.type === 'Day off') category = 'DAYS OFF';
            else if (leave.type === 'Roster leave') category = 'ROSTER LEAVE';
            else category = 'ANNUAL LEAVE'; 
         } else if (restLock) {
            category = 'RESTING (POST-DUTY)';
         } else if (s.type === 'Roster') {
             const isOutside = s.workFromDate && s.workToDate && (dateStr < s.workFromDate || dateStr > s.workToDate);
             category = isOutside ? 'ROSTER LEAVE' : 'STANDBY (RESERVE)';
         } else if (s.type === 'Local') {
             category = 'DAYS OFF';
         } else {
             category = 'STANDBY (RESERVE)';
         }

         if (registryGroups[category]) {
             if (includeCounts) {
                 const count = getConsecutiveCount(s, dateStr, category);
                 registryGroups[category].push(`${s.initials} (${count})`);
             } else {
                 registryGroups[category].push(s.initials);
             }
         }
      });
      return registryGroups;
  };

  const formatRoleCode = (role: string) => {
    const r = String(role || '').trim().toUpperCase();
    if (!r) return '';
    if (r.includes('SHIFT LEADER') || r === 'SL') return 'SL';
    if (r.includes('LOAD CONTROL') || r === 'LC') return 'LC';
    if (r.includes('RAMP') || r === 'RMP') return 'RMP';
    if (r.includes('OPERATIONS') || r.includes('OPS') || r === 'OPS') return 'OPS';
    if (r.includes('LOST') || r === 'LF' || r === 'L&F') return 'LF';
    if (r.includes('LC') && r.includes('SL')) return 'LC/SL';
    const genericRoles = ['AGT', 'AGENT', 'STAFF', 'MEMBER', 'CREW', 'GEN', 'FILLER', 'GHA'];
    if (genericRoles.some(gr => r === gr || r.includes(gr))) return '';
    return '';
  };

  const formatRoleLabel = (role: string | undefined) => {
    const code = formatRoleCode(role || '');
    return code ? `(${code})` : '';
  };

  const runAudit = () => {
    setIsRepairing(true);
    setTimeout(() => {
      const violations: string[] = [];
      staff.forEach(s => {
        if (s.type === 'Local') {
           const count = staffStats[s.id]?.work || 0;
           let limit = 5;
           if (startDate && endDate) {
             const progStart = new Date(startDate);
             const progEnd = new Date(endDate);
             const sLeaves = leaveRequests.filter(l => l.staffId === s.id);
             let leaveDays = 0;
             sLeaves.forEach(l => {
                 const lStart = new Date(l.startDate);
                 const lEnd = new Date(l.endDate);
                 leaveDays += getOverlapDays(progStart, progEnd, lStart, lEnd);
             });
             limit = Math.max(0, 5 - leaveDays);
           }
           if (count > limit) violations.push(`MAX SHIFTS: ${s.name} is assigned ${count} shifts (Max allowed: ${limit}, adjusted for leave).`);
        }
      });
      staff.forEach(s => {
        if (s.type === 'Roster' && s.workFromDate && s.workToDate) {
          filteredPrograms.forEach(p => {
            if (p.assignments.some(a => a.staffId === s.id)) {
              if (p.dateString! < s.workFromDate! || p.dateString! > s.workToDate!) {
                violations.push(`CONTRACT DATE: ${s.initials} working on ${p.dateString} (Outside ${s.workFromDate} - ${s.workToDate}).`);
              }
            }
          });
        }
      });
      filteredPrograms.forEach(p => {
        p.assignments.forEach(a => {
          const s = getStaffById(a.staffId);
          if (!s) return;
          const roleCode = formatRoleCode(a.role || '');
          if (roleCode === 'SL' && !s.isShiftLeader) violations.push(`QUALIFICATION: ${s.initials} assigned SL on ${p.dateString} but lacks qualification.`);
          if (roleCode === 'LC' && !s.isLoadControl) violations.push(`QUALIFICATION: ${s.initials} assigned LC on ${p.dateString} but lacks qualification.`);
          const sh = getShiftById(a.shiftId);
          if (sh) {
            const rest = calculateRestHours(a.staffId, p.dateString!, sh.pickupTime);
            if (rest !== null && rest < minRestHours) {
              violations.push(`FATIGUE RISK: ${s.initials} has only ${rest.toFixed(1)}h rest before ${p.dateString} (Min: ${minRestHours}h).`);
            }
          }
        });
      });
      if (violations.length === 0) {
        alert("Audit Complete: No critical violations found.");
        setIsRepairing(false);
      } else {
        setAuditViolations(violations);
        setSelectedViolationIndices(new Set(violations.map((_, i) => i)));
        setAuditModalOpen(true);
        setIsRepairing(false);
      }
    }, 100);
  };

  const handleRepairConfirm = async () => {
     if (selectedViolationIndices.size === 0) return;
     setIsRepairing(true);
     setAuditModalOpen(false);
     const report = auditViolations.filter((_, i) => selectedViolationIndices.has(i)).join('\n');
     try {
       const result = await repairProgramWithAI(programs, report, { flights, staff, shifts, programs: [], leaveRequests, incomingDuties }, { minRestHours });
       if (onUpdatePrograms && result.programs) {
         onUpdatePrograms(result.programs);
       }
     } catch (e: any) {
       alert("Repair failed: " + e.message);
     } finally {
       setIsRepairing(false);
     }
  };

  const toggleViolation = (index: number) => {
    const next = new Set(selectedViolationIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedViolationIndices(next);
  };

  const exportPDF = () => {
    if (filteredPrograms.length === 0) return;
    
    // --- 1. CALCULATE FORECAST STATS ---
    let totalSupply = 0;
    let totalDemand = 0;
    const duration = filteredPrograms.length;
    
    // Demand
    shifts.forEach(s => {
       if (startDate && endDate && s.pickupDate >= startDate && s.pickupDate <= endDate) {
          totalDemand += s.minStaff || 0;
       }
    });

    // Supply
    staff.forEach(s => {
       totalSupply += calculateCredits(s, startDate || '', duration, leaveRequests);
    });

    const balance = totalSupply - totalDemand;
    const health = balance >= 0 ? "HEALTHY" : "CRITICAL";
    
    // --- 2. GENERATE PDF ---
    const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
    const headerBlack = [0, 0, 0] as [number, number, number];
    const auditBlue = [2, 6, 23] as [number, number, number];
    const matrixOrange = [217, 119, 6] as [number, number, number];

    filteredPrograms.forEach((program, idx) => {
      if (idx > 0) doc.addPage('l', 'mm', 'a4');
      
      // Header Info
      doc.setFont('helvetica', 'bold').setFontSize(20).text(`SkyOPS Station Handling Program`, 14, 15);
      doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(100).text(`Target Period: ${startDate} to ${endDate}`, 14, 22);
      
      // EXECUTIVE SUMMARY BOX (Only on First Page)
      if (idx === 0) {
          const startX = 200;
          const startY = 5;
          const boxWidth = 80;
          const boxHeight = 25;
          
          doc.setFillColor(245, 245, 245);
          doc.rect(startX, startY, boxWidth, boxHeight, 'F');
          doc.setDrawColor(200, 200, 200);
          doc.rect(startX, startY, boxWidth, boxHeight, 'S');

          doc.setFontSize(8).setFont('helvetica', 'bold').setTextColor(0);
          doc.text("MANPOWER CAPACITY FORECAST", startX + 5, startY + 5);

          doc.setFontSize(7).setFont('helvetica', 'normal').setTextColor(50);
          doc.text(`Total Supply: ${totalSupply} Shifts`, startX + 5, startY + 10);
          doc.text(`Total Demand: ${totalDemand} Shifts (Min)`, startX + 5, startY + 14);
          
          doc.setFont('helvetica', 'bold');
          if (balance < 0) doc.setTextColor(220, 38, 38); // Red
          else doc.setTextColor(22, 163, 74); // Green
          doc.text(`Net Balance: ${balance > 0 ? '+' : ''}${balance}`, startX + 5, startY + 18);
          doc.text(`Status: ${health}`, startX + 45, startY + 18);
          
          // Reset colors
          doc.setTextColor(0); 
      }

      doc.setFontSize(14).setFont('helvetica', 'bold').setTextColor(0).text(getDayLabel(program), 14, 32);
      
      // Program Table
      const shiftsMap: Record<string, Assignment[]> = {};
      program.assignments.forEach(a => {
        if (!shiftsMap[a.shiftId || '']) shiftsMap[a.shiftId || ''] = [];
        shiftsMap[a.shiftId || ''].push(a);
      });
      const sortedShiftIds = Object.keys(shiftsMap).sort((a,b) => {
         const sA = getShiftById(a); const sB = getShiftById(b);
         return (sA?.pickupTime || '').localeCompare(sB?.pickupTime || '');
      });
      const tableData = sortedShiftIds.map((shiftId, i) => {
        const sh = getShiftById(shiftId);
        const pickupTime = sh?.pickupTime || 'UNK';
        const endTime = sh?.endTime || 'UNK';
        const maxStaff = sh?.maxStaff || sh?.minStaff || '?';
        const fls = sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join('/') || 'NIL';
        const personnelStr = shiftsMap[shiftId].map(a => {
          const st = getStaffById(a.staffId);
          const roleLabel = formatRoleLabel(a.role);
          const rest = calculateRestHours(a.staffId, program.dateString!, sh?.pickupTime || '');
          const restStr = rest !== null ? ` [${rest.toFixed(1)}H]` : '';
          return `${st?.initials || '??'}${roleLabel ? ' ' + roleLabel : ''}${restStr}`;
        }).join(' | ');
        return [(i+1).toString(), pickupTime, endTime, fls, `${shiftsMap[shiftId].length} / ${maxStaff}`, personnelStr];
      });
      autoTable(doc, {
        startY: 36, head: [['S/N', 'PICKUP', 'RELEASE', 'FLIGHTS', 'HC / MAX', 'PERSONNEL & ASSIGNED ROLES']], body: tableData, theme: 'grid',
        headStyles: { fillColor: headerBlack, textColor: 255, fontSize: 9, fontStyle: 'bold', cellPadding: 3 },
        bodyStyles: { fontSize: 8, cellPadding: 3, textColor: 50 },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 20 }, 2: { cellWidth: 20 }, 3: { cellWidth: 30 }, 4: { cellWidth: 20 }, 5: { cellWidth: 'auto' } },
        styles: { lineColor: [220, 220, 220], lineWidth: 0.1 }
      });
      
      // Registry Table
      const currentY = (doc as any).lastAutoTable.finalY + 12;
      doc.setFontSize(12).setFont('helvetica', 'bold').text("ABSENCE AND REST REGISTRY", 14, currentY);
      const registryGroups = getFullRegistryForDay(program, true); // Pass true to include counts
      const registryBody = [
         ['STATUS CATEGORY', 'PERSONNEL INITIALS'],
         ['RESTING (POST-DUTY)', registryGroups['RESTING (POST-DUTY)'].join(', ') || 'NONE'],
         ['DAYS OFF', registryGroups['DAYS OFF'].join(', ') || 'NONE'],
         ['ROSTER LEAVE', registryGroups['ROSTER LEAVE'].join(', ') || 'NONE'],
         ['ANNUAL LEAVE', registryGroups['ANNUAL LEAVE'].join(', ') || 'NONE'],
         ['STANDBY (RESERVE)', registryGroups['STANDBY (RESERVE)'].join(', ') || 'NONE'],
      ];
      autoTable(doc, {
        startY: currentY + 3, head: [['STATUS CATEGORY', 'PERSONNEL INITIALS']], body: registryBody.slice(1), theme: 'grid',
        headStyles: { fillColor: [60, 70, 80], textColor: 255, fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } }
      });
    });

    // Audits & Matrix Pages (Unchanged)
    doc.addPage('l', 'mm', 'a4');
    doc.setFontSize(20).setTextColor(0).text("Weekly Personnel Utilization Audit (Local)", 14, 20);
    const localAuditRows = staff.filter(s => s.type === 'Local').map((s, i) => {
       const st = staffStats[s.id];
       return [(i+1).toString(), s.name, s.initials, st.work.toString(), st.off.toString(), st.work === 5 ? 'MATCH' : 'CHECK'];
    });
    autoTable(doc, { startY: 25, head: [['S/N', 'NAME', 'INIT', 'WORK SHIFTS', 'OFF DAYS', 'STATUS']], body: localAuditRows, theme: 'grid', headStyles: { fillColor: headerBlack } });

    doc.addPage('l', 'mm', 'a4');
    doc.setFontSize(20).setTextColor(0).text("Weekly Personnel Utilization Audit (Roster)", 14, 20);
    const rosterAuditRows = staff.filter(s => s.type === 'Roster').map((s, i) => {
       const st = staffStats[s.id];
       return [
         (i+1).toString(), s.name, s.initials, s.workFromDate || '-', s.workToDate || '-',
         st.rosterPotential.toString(), st.work.toString(), st.work === st.rosterPotential ? 'MATCH' : 'CHECK'
       ];
    });
    autoTable(doc, { startY: 25, head: [['S/N', 'NAME', 'INIT', 'WORK FROM', 'WORK TO', 'POTENTIAL', 'ACTUAL', 'STATUS']], body: rosterAuditRows, theme: 'grid', headStyles: { fillColor: headerBlack } });

    // Matrix View
    doc.addPage('l', 'mm', 'a4');
    doc.setFontSize(20).setTextColor(0).text("Weekly Operations Matrix View", 14, 20);
    
    // Matrix Headers
    const dateHeaders = filteredPrograms.map(p => {
        const d = new Date(p.dateString || '');
        return `${d.getDate()}/${d.getMonth()+1}`;
    });
    const matrixHead = [['S/N', 'AGENT', ...dateHeaders, 'AUDIT']];
    
    // Matrix Body
    const matrixBody = staff.map((s, i) => {
       const row = [(i+1).toString(), `${s.initials} (${s.type === 'Local' ? 'L' : 'R'})`];
       let workCount = 0;
       
       filteredPrograms.forEach(p => {
          const assign = p.assignments.find(a => a.staffId === s.id);
          if (assign) {
             const sh = getShiftById(assign.shiftId);
             // Calculate rest hours from previous shift/duty
             const rest = calculateRestHours(s.id, p.dateString!, sh?.pickupTime || '');
             // Format: "08:00 [12.5H]"
             const restLabel = rest !== null ? ` [${rest.toFixed(1)}H]` : '';
             row.push((sh?.pickupTime || 'WORK') + restLabel);
             workCount++;
          } else {
             row.push('-');
          }
       });
       
       row.push(`${workCount}/${filteredPrograms.length}`);
       return row;
    });

    autoTable(doc, { 
      startY: 25, 
      head: matrixHead, 
      body: matrixBody, 
      theme: 'grid',
      headStyles: { fillColor: matrixOrange, fontSize: 8 },
      bodyStyles: { fontSize: 7, cellPadding: 2 },
      styles: { halign: 'center' },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 30, halign: 'left' } },
      didParseCell: (data) => {
        // Detect Rest Hours Violation in Matrix Cells
        // Column 0 is S/N, Column 1 is Name, Column Last is Audit.
        // Data columns are index 2 to (length-2).
        if (data.section === 'body' && data.column.index >= 2 && data.column.index < data.table.columns.length - 1) {
           const text = data.cell.text[0] || '';
           // Look for pattern [12.5H] or similar
           const match = text.match(/\[(\d+(\.\d+)?)H\]/);
           if (match) {
              const restHours = parseFloat(match[1]);
              if (restHours < minRestHours!) {
                 // VIOLATION: Set Background Red, Text White
                 data.cell.styles.fillColor = [220, 38, 38]; // Red
                 data.cell.styles.textColor = [255, 255, 255]; // White
                 data.cell.styles.fontStyle = 'bold';
              }
           }
        }
      }
    });

    doc.save(`SkyOPS_Program_${startDate}.pdf`);
  };

  const getDayLabel = (program: DailyProgram) => {
    if (!program.dateString) return `Day ${program.day + 1}`;
    const date = new Date(program.dateString);
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    return `${days[date.getDay()]} - ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  };

  if (!filteredPrograms.length) {
    return (
      <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem]">
         <CalendarDays size={64} className="text-slate-200 mb-6" />
         <h3 className="text-xl font-black italic uppercase text-slate-300 tracking-tighter">Program Matrix Empty</h3>
         <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest mt-2">Generate a schedule to view results</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 md:space-y-12 pb-12 md:pb-24 animate-in fade-in duration-500">
      <div className="bg-slate-950 text-white p-6 md:p-14 rounded-3xl md:rounded-[3.5rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-600/10 blur-[100px] pointer-events-none"></div>
        <div className="flex items-center gap-6 md:gap-8 relative z-10 flex-col md:flex-row text-center md:text-left">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-emerald-600 rounded-2xl md:rounded-[2rem] flex items-center justify-center shadow-lg shadow-emerald-600/20">
            <LayoutGrid size={28} className="md:w-9 md:h-9" />
          </div>
          <div>
            <h3 className="text-2xl md:text-3xl font-black uppercase italic tracking-tighter text-white">Master Program</h3>
            <p className="text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] mt-2 flex items-center justify-center md:justify-start gap-2">
              <ShieldCheck size={14} className="text-blue-500" /> Authorized Schedule
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto relative z-10">
          <button onClick={runAudit} className="flex-1 px-6 py-4 md:px-8 md:py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-indigo-600/20 group">
             <Activity size={18} className="group-hover:animate-pulse"/>
             <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest italic">Safety Audit</span>
          </button>
          <button onClick={exportPDF} className="flex-1 px-6 py-4 md:px-8 md:py-5 bg-white text-slate-950 hover:bg-slate-100 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl">
             <Printer size={18} />
             <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest italic">Export PDF</span>
          </button>
        </div>
      </div>

      <div className="space-y-8 md:space-y-12">
        {filteredPrograms.map((program) => {
           const registryGroups = getFullRegistryForDay(program, true);

           return (
            <div key={program.day} className="bg-white rounded-3xl md:rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
               <div className="bg-slate-50/50 p-6 md:p-10 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex items-center gap-4 md:gap-6">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-white rounded-2xl flex items-center justify-center font-black italic text-lg md:text-xl shadow-sm text-slate-900 border border-slate-100">
                      {new Date(program.dateString!).getDate()}
                    </div>
                    <div>
                      <h4 className="text-xl md:text-2xl font-black uppercase italic text-slate-900 leading-none">{getDayLabel(program).split(' - ')[0]}</h4>
                      <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5">{program.dateString}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-xl border border-slate-100 shadow-sm">
                     <Users size={14} className="text-blue-500" />
                     <span className="text-[9px] md:text-[10px] font-black text-slate-600 uppercase tracking-widest">
                       {program.assignments.length} Active Personnel
                     </span>
                  </div>
               </div>

               <div className="p-6 md:p-10">
                  <div className="overflow-x-auto no-scrollbar pb-4">
                    <table className="w-full min-w-[800px]">
                      <thead>
                        <tr className="text-left border-b-2 border-slate-100">
                          <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest w-16">S/N</th>
                          <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest w-24">Pickup</th>
                          <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest w-24">Release</th>
                          <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest w-48">Flights</th>
                          <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest w-24">HC / Max</th>
                          <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Personnel & Roles</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm font-medium text-slate-700">
                        {(() => {
                          const shiftsMap: Record<string, Assignment[]> = {};
                          program.assignments.forEach(a => {
                            if (!shiftsMap[a.shiftId || '']) shiftsMap[a.shiftId || ''] = [];
                            shiftsMap[a.shiftId || ''].push(a);
                          });
                          const sortedShiftIds = Object.keys(shiftsMap).sort((a,b) => {
                            const sA = getShiftById(a); const sB = getShiftById(b);
                            return (sA?.pickupTime || '').localeCompare(sB?.pickupTime || '');
                          });

                          return sortedShiftIds.map((shiftId, i) => {
                            const sh = getShiftById(shiftId);
                            const activeCount = shiftsMap[shiftId].length;
                            const max = sh?.maxStaff || sh?.minStaff || '?';
                            const flightList = sh?.flightIds?.map(fid => getFlightById(fid)?.flightNumber).filter(Boolean).join(' / ') || '-';
                            
                            return (
                              <tr key={shiftId} className="border-b border-slate-50 group hover:bg-slate-50/50 transition-colors">
                                <td className="py-6 font-black text-slate-300">{i + 1}</td>
                                <td className="py-6 font-black italic">{sh?.pickupTime}</td>
                                <td className="py-6 font-black italic text-slate-500">{sh?.endTime}</td>
                                <td className="py-6 font-bold text-xs uppercase tracking-tight text-blue-600">{flightList}</td>
                                <td className="py-6 font-black text-xs">
                                  <span className={activeCount < (sh?.minStaff || 0) ? 'text-rose-500' : 'text-emerald-500'}>{activeCount}</span>
                                  <span className="text-slate-300"> / {max}</span>
                                </td>
                                <td className="py-6">
                                  <div className="flex flex-wrap gap-2">
                                    {shiftsMap[shiftId].map((assign, idx) => {
                                      const s = getStaffById(assign.staffId);
                                      const rest = calculateRestHours(assign.staffId, program.dateString!, sh?.pickupTime || '');
                                      const isFatigued = rest !== null && rest < minRestHours;
                                      
                                      return (
                                        <div key={idx} className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm ${isFatigued ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-white border-slate-100 text-slate-700'}`}>
                                          <span>{s?.initials}</span>
                                          {formatRoleCode(assign.role) && (
                                            <span className="px-1 py-0.5 bg-slate-900 text-white rounded-[4px] text-[7px] tracking-tight">{formatRoleCode(assign.role)}</span>
                                          )}
                                          {rest !== null && (
                                            <span className={`text-[8px] ${isFatigued ? 'text-rose-400' : 'text-slate-400'}`}>[{rest.toFixed(1)}H]</span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Registry Section */}
                  <div className="mt-8 bg-slate-50 rounded-2xl p-6 md:p-8 border border-slate-100">
                     <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                       <Moon size={14} className="text-indigo-400"/> Absence & Rest Registry
                     </h5>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                        {Object.entries(registryGroups).map(([category, names]) => (
                          <div key={category} className="flex flex-col gap-1">
                             <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{category}</span>
                             {names.length > 0 ? (
                               <p className="text-xs font-medium text-slate-700 leading-relaxed">{names.join(', ')}</p>
                             ) : (
                               <span className="text-[9px] italic text-slate-300">None</span>
                             )}
                          </div>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
           );
        })}
      </div>

      {auditModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in">
           <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-8 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600">
                       <ShieldAlert size={24} />
                    </div>
                    <div>
                       <h3 className="text-xl font-black italic text-rose-600 uppercase tracking-tighter">Safety Violations</h3>
                       <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mt-1">Found {auditViolations.length} Issues</p>
                    </div>
                 </div>
                 <button onClick={() => setAuditModalOpen(false)} className="p-2 text-rose-300 hover:text-rose-600 transition-colors"><X size={24}/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-4">
                 {auditViolations.map((v, i) => (
                   <div key={i} onClick={() => toggleViolation(i)} className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 ${selectedViolationIndices.has(i) ? 'bg-rose-50 border-rose-500' : 'bg-white border-slate-100 opacity-50 hover:opacity-100'}`}>
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${selectedViolationIndices.has(i) ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-300 bg-white'}`}>
                        {selectedViolationIndices.has(i) && <Check size={12} />}
                      </div>
                      <p className="text-xs font-bold text-slate-700 leading-relaxed pt-0.5">{v}</p>
                   </div>
                 ))}
              </div>
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-4">
                 <button onClick={() => setAuditModalOpen(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600">Dismiss</button>
                 <button onClick={handleRepairConfirm} disabled={selectedViolationIndices.size === 0 || isRepairing} className="flex-[2] py-4 bg-slate-950 text-white rounded-2xl font-black uppercase italic tracking-widest hover:bg-rose-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                    {isRepairing ? <Loader2 className="animate-spin" /> : <Hammer size={16} />}
                    {isRepairing ? 'AI Repairing...' : 'Auto-Fix Selected'}
                 </button>
              </div>
           </div>
        </div>
      )}

      {isRepairing && !auditModalOpen && (
        <div className="fixed inset-0 z-[2100] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
           <Loader2 size={48} className="text-white animate-spin mb-4" />
           <p className="text-white font-black uppercase italic tracking-widest animate-pulse">AI Re-Balancing Roster...</p>
        </div>
      )}
    </div>
  );
};
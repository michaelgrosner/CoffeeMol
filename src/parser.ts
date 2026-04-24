'use strict';

import {
  ParsedStructure,
  ParsedAtom,
  nuc_acids,
  SecondaryStructureRange,
} from './types';

export function parsePDB(data: string): ParsedStructure {
  const atoms: ParsedAtom[] = [];
  const secondary_structure: SecondaryStructureRange[] = [];
  let title = '';

  const handleResiName = (r: string) =>
    nuc_acids.slice(4).includes(r) ? r.substring(1, 3) : r;
  const handleAtomName = (a: string) => a.substring(0, 1);

  for (const line of data.split('\n')) {
    if (line.startsWith('TITLE')) {
      const t = line.substring(6).trim();
      if (!title) title = t;
      else title += ' ' + t;
      continue;
    }
    if (line.startsWith('HELIX')) {
      secondary_structure.push({
        type: 'helix',
        chain_id: line.substring(19, 20).trim(),
        start_resi_id: parseInt(line.substring(21, 25).trim()),
        end_resi_id: parseInt(line.substring(33, 37).trim()),
      });
      continue;
    }
    if (line.startsWith('SHEET')) {
      secondary_structure.push({
        type: 'sheet',
        chain_id: line.substring(21, 22).trim(),
        start_resi_id: parseInt(line.substring(22, 26).trim()),
        end_resi_id: parseInt(line.substring(33, 37).trim()),
      });
      continue;
    }
    if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) continue;

    const isHetatm = line.startsWith('HETATM');
    const raw = line.substring(12, 16).trim();
    atoms.push({
      original_atom_name: raw,
      atom_name: handleAtomName(raw),
      resi_name: handleResiName(line.substring(17, 20).trim()),
      chain_id: line.substring(21, 22).trim(),
      resi_id: parseInt(line.substring(22, 26).trim()),
      x: parseFloat(line.substring(30, 38).trim()),
      y: parseFloat(line.substring(38, 46).trim()),
      z: parseFloat(line.substring(46, 54).trim()),
      tempFactor: parseFloat(line.substring(60, 66).trim()) || 0,
      isHetatm,
    });
  }

  return { title, atoms, secondary_structure };
}

export function parseMmCIF(data: string): ParsedStructure {
  const atoms: ParsedAtom[] = [];
  const secondary_structure: SecondaryStructureRange[] = [];
  let title = '';

  const handleResiName = (r: string) =>
    nuc_acids.slice(4).includes(r) ? r.substring(1, 3) : r;
  const handleAtomName = (a: string) => a.substring(0, 1);

  // Simple CIF parser
  const lines = data.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) {
      i++;
      continue;
    }

    if (line.startsWith('_struct.title')) {
      const t = line.substring(13).trim();
      if (t) {
        if (t.startsWith("'") || t.startsWith('"')) {
          const quote = t[0];
          if (t.endsWith(quote) && t.length > 1) {
            title = t.substring(1, t.length - 1);
            i++;
          } else {
            title = t.substring(1);
            i++;
            while (i < lines.length) {
              const nextLine = lines[i].trim();
              if (nextLine.endsWith(quote)) {
                title += ' ' + nextLine.substring(0, nextLine.length - 1);
                i++;
                break;
              }
              title += ' ' + nextLine;
              i++;
            }
          }
        } else {
          title = t;
          i++;
        }
      } else {
        // Multi-line semicolon string
        i++;
        if (i < lines.length && lines[i].trim().startsWith(';')) {
          title = lines[i].trim().substring(1);
          i++;
          while (i < lines.length) {
            const nextLine = lines[i].trim();
            if (nextLine.startsWith(';')) {
              i++;
              break;
            }
            title += ' ' + nextLine;
            i++;
          }
        }
      }
    } else if (line.startsWith('loop_')) {
      i++;
      const attributes: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('_')) {
        attributes.push(lines[i].trim());
        i++;
      }

      if (attributes.some((a) => a.startsWith('_atom_site.'))) {
        const attrMap: Record<string, number> = {};
        attributes.forEach((attr, idx) => (attrMap[attr] = idx));
        const getAttr = (key: string) => attrMap[`_atom_site.${key}`];
        const atomIdIdx = getAttr('auth_atom_id') ?? getAttr('label_atom_id');
        const compIdIdx = getAttr('auth_comp_id') ?? getAttr('label_comp_id');
        const seqIdIdx = getAttr('auth_seq_id') ?? getAttr('label_seq_id');
        const asymIdIdx = getAttr('auth_asym_id') ?? getAttr('label_asym_id');
        const xIdx = getAttr('Cartn_x');
        const yIdx = getAttr('Cartn_y');
        const zIdx = getAttr('Cartn_z');
        const tempIdx = getAttr('B_iso_or_equiv');
        const groupIdx = getAttr('group_PDB');

        if (
          atomIdIdx !== undefined &&
          compIdIdx !== undefined &&
          seqIdIdx !== undefined &&
          asymIdIdx !== undefined &&
          xIdx !== undefined &&
          yIdx !== undefined &&
          zIdx !== undefined
        ) {
          while (i < lines.length) {
            const rowLine = lines[i].trim();
            if (
              !rowLine ||
              rowLine.startsWith('#') ||
              rowLine.startsWith('loop_') ||
              rowLine.startsWith('_')
            )
              break;
            const values = tokenizeCifLine(rowLine);
            if (values.length >= attributes.length) {
              const raw = values[atomIdIdx];
              const isHetatm = groupIdx !== undefined && values[groupIdx] === 'HETATM';
              atoms.push({
                original_atom_name: raw,
                atom_name: handleAtomName(raw),
                resi_name: handleResiName(values[compIdIdx]),
                chain_id: values[asymIdIdx],
                resi_id: parseInt(values[seqIdIdx]),
                x: parseFloat(values[xIdx]),
                y: parseFloat(values[yIdx]),
                z: parseFloat(values[zIdx]),
                tempFactor:
                  tempIdx !== undefined ? parseFloat(values[tempIdx]) : 0,
                isHetatm,
              });
            }
            i++;
          }
        }
      } else if (attributes.some((a) => a.startsWith('_struct_conf.'))) {
        const attrMap: Record<string, number> = {};
        attributes.forEach((attr, idx) => (attrMap[attr] = idx));
        const getAttr = (key: string) => attrMap[`_struct_conf.${key}`];
        const typeIdx = getAttr('conf_type_id');
        const startAsymIdx =
          getAttr('beg_auth_asym_id') ?? getAttr('beg_label_asym_id');
        const startSeqIdx =
          getAttr('beg_auth_seq_id') ?? getAttr('beg_label_seq_id');
        const endSeqIdx =
          getAttr('end_auth_seq_id') ?? getAttr('end_label_seq_id');

        if (
          typeIdx !== undefined &&
          startAsymIdx !== undefined &&
          startSeqIdx !== undefined &&
          endSeqIdx !== undefined
        ) {
          while (i < lines.length) {
            const rowLine = lines[i].trim();
            if (
              !rowLine ||
              rowLine.startsWith('#') ||
              rowLine.startsWith('loop_') ||
              rowLine.startsWith('_')
            )
              break;
            const v = tokenizeCifLine(rowLine);
            if (v.length >= attributes.length && v[typeIdx].includes('HELX')) {
              secondary_structure.push({
                type: 'helix',
                chain_id: v[startAsymIdx],
                start_resi_id: parseInt(v[startSeqIdx]),
                end_resi_id: parseInt(v[endSeqIdx]),
              });
            }
            i++;
          }
        }
      } else if (attributes.some((a) => a.startsWith('_struct_sheet_range.'))) {
        const attrMap: Record<string, number> = {};
        attributes.forEach((attr, idx) => (attrMap[attr] = idx));
        const getAttr = (key: string) => attrMap[`_struct_sheet_range.${key}`];
        const startAsymIdx =
          getAttr('beg_auth_asym_id') ?? getAttr('beg_label_asym_id');
        const startSeqIdx =
          getAttr('beg_auth_seq_id') ?? getAttr('beg_label_seq_id');
        const endSeqIdx =
          getAttr('end_auth_seq_id') ?? getAttr('end_label_seq_id');

        if (
          startAsymIdx !== undefined &&
          startSeqIdx !== undefined &&
          endSeqIdx !== undefined
        ) {
          while (i < lines.length) {
            const rowLine = lines[i].trim();
            if (
              !rowLine ||
              rowLine.startsWith('#') ||
              rowLine.startsWith('loop_') ||
              rowLine.startsWith('_')
            )
              break;
            const v = tokenizeCifLine(rowLine);
            if (v.length >= attributes.length) {
              secondary_structure.push({
                type: 'sheet',
                chain_id: v[startAsymIdx],
                start_resi_id: parseInt(v[startSeqIdx]),
                end_resi_id: parseInt(v[endSeqIdx]),
              });
            }
            i++;
          }
        }
      }
    } else {
      i++;
    }
  }

  return { title, atoms, secondary_structure };
}

function tokenizeCifLine(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false;
        tokens.push(current);
        current = '';
      } else {
        current += char;
      }
    } else {
      if (char === "'" || char === '"') {
        inQuotes = true;
        quoteChar = char;
      } else if (char === ' ' || char === '\t') {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

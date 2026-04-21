'use strict';

import { ParsedStructure, ParsedAtom, nuc_acids } from './types';

export function parsePDB(data: string): ParsedStructure {
    const atoms: ParsedAtom[] = [];
    let title = '';

    const handleResiName = (r: string) => nuc_acids.slice(4).includes(r) ? r.substring(1, 3) : r;
    const handleAtomName = (a: string) => a.substring(0, 1);

    for (const line of data.split('\n')) {
        if (line.startsWith("TITLE")) {
            const t = line.substring(6).trim();
            if (!title) title = t;
            else title += " " + t;
            continue;
        }
        if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) continue;

        const raw = line.substring(12, 16).trim();
        atoms.push({
            original_atom_name: raw,
            atom_name:          handleAtomName(raw),
            resi_name:          handleResiName(line.substring(17, 20).trim()),
            chain_id:           line.substring(21, 22).trim(),
            resi_id:            parseInt(line.substring(22, 26).trim()),
            x:                  parseFloat(line.substring(30, 38).trim()),
            y:                  parseFloat(line.substring(38, 46).trim()),
            z:                  parseFloat(line.substring(46, 54).trim()),
        });
    }

    return { title, atoms };
}

export function parseMmCIF(data: string): ParsedStructure {
    const atoms: ParsedAtom[] = [];
    let title = '';

    const handleResiName = (r: string) => nuc_acids.slice(4).includes(r) ? r.substring(1, 3) : r;
    const handleAtomName = (a: string) => a.substring(0, 1);

    // Simple CIF parser
    const lines = data.split('\n');
    let i = 0;
    while (i < lines.length) {
        let line = lines[i].trim();
        if (!line || line.startsWith('#')) {
            i++;
            continue;
        }

        if (line.startsWith('_struct.title')) {
            let t = line.substring(13).trim();
            if (t) {
                if (t.startsWith("'") || t.startsWith('"')) {
                    const quote = t[0];
                    if (t.endsWith(quote) && t.length > 1) {
                        title = t.substring(1, t.length - 1);
                    } else {
                        title = t.substring(1);
                        i++;
                        while (i < lines.length) {
                            const nextLine = lines[i].trim();
                            if (nextLine.endsWith(quote)) {
                                title += " " + nextLine.substring(0, nextLine.length - 1);
                                break;
                            }
                            title += " " + nextLine;
                            i++;
                        }
                    }
                } else {
                    title = t;
                }
            } else {
                // Multi-line semicolon string
                i++;
                if (i < lines.length && lines[i].trim().startsWith(';')) {
                    title = lines[i].trim().substring(1);
                    i++;
                    while (i < lines.length) {
                        const nextLine = lines[i].trim();
                        if (nextLine.startsWith(';')) break;
                        title += " " + nextLine;
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

            if (attributes.some(a => a.startsWith('_atom_site.'))) {
                // Parse atom_site loop
                const attrMap: Record<string, number> = {};
                attributes.forEach((attr, idx) => attrMap[attr] = idx);

                const getAttr = (key: string) => attrMap[`_atom_site.${key}`];

                const groupIdx = getAttr('group_PDB');
                const atomIdIdx = getAttr('auth_atom_id') ?? getAttr('label_atom_id');
                const compIdIdx = getAttr('auth_comp_id') ?? getAttr('label_comp_id');
                const seqIdIdx = getAttr('auth_seq_id') ?? getAttr('label_seq_id');
                const asymIdIdx = getAttr('auth_asym_id') ?? getAttr('label_asym_id');
                const xIdx = getAttr('Cartn_x');
                const yIdx = getAttr('Cartn_y');
                const zIdx = getAttr('Cartn_z');

                if (atomIdIdx !== undefined && compIdIdx !== undefined && seqIdIdx !== undefined &&
                    asymIdIdx !== undefined && xIdx !== undefined && yIdx !== undefined && zIdx !== undefined) {
                    
                    while (i < lines.length) {
                        const rowLine = lines[i].trim();
                        if (!rowLine || rowLine.startsWith('#') || rowLine.startsWith('loop_') || rowLine.startsWith('_')) break;
                        
                        const values = tokenizeCifLine(rowLine);
                        if (values.length >= attributes.length) {
                            const raw = values[atomIdIdx];
                            atoms.push({
                                original_atom_name: raw,
                                atom_name:          handleAtomName(raw),
                                resi_name:          handleResiName(values[compIdIdx]),
                                chain_id:           values[asymIdIdx],
                                resi_id:            parseInt(values[seqIdIdx]),
                                x:                  parseFloat(values[xIdx]),
                                y:                  parseFloat(values[yIdx]),
                                z:                  parseFloat(values[zIdx]),
                            });
                        }
                        i++;
                    }
                } else {
                    // Skip this loop if attributes are missing
                    while (i < lines.length) {
                        const rowLine = lines[i].trim();
                        if (!rowLine || rowLine.startsWith('#') || rowLine.startsWith('loop_') || rowLine.startsWith('_')) break;
                        i++;
                    }
                }
                continue; // loop_ already advanced i
            }
        }
        i++;
    }

    return { title, atoms };
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

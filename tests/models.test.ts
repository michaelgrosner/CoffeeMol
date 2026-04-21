import { describe, it, expect } from 'vitest';
import { Atom, Residue, Chain, Structure, atomAtomDistance } from '../src/models';
import { CanvasContext } from '../src/coffeemol';

describe('Models', () => {
    it('should calculate distance between atoms', () => {
        // We need a minimal environment to create Atoms
        // Atoms need Residue -> Chain -> Structure -> CanvasContext
        // For testing purpose, we can mock or use a dummy CanvasContext
        
        const dummyCC = {
            addElement: () => {},
            canvas: { style: {} },
            context: {},
        } as any;

        const s = new Structure(null, 'test', dummyCC);
        const c = new Chain(s, 'A');
        const r = new Residue(c, 'ALA', 1);
        
        const a1 = new Atom(r, 'N', 0, 0, 0, 'N');
        const a2 = new Atom(r, 'CA', 3, 4, 0, 'CA');
        
        expect(atomAtomDistance(a1, a2)).toBe(5);
    });
});

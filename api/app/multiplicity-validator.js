const ATOMIC_NUMBERS = {
  H: 1, He: 2, Li: 3, Be: 4, B: 5, C: 6, N: 7, O: 8, F: 9, Ne: 10,
  Na: 11, Mg: 12, Al: 13, Si: 14, P: 15, S: 16, Cl: 17, Ar: 18,
  K: 19, Ca: 20, Sc: 21, Ti: 22, V: 23, Cr: 24, Mn: 25, Fe: 26,
  Co: 27, Ni: 28, Cu: 29, Zn: 30, Ga: 31, Ge: 32, As: 33, Se: 34,
  Br: 35, Kr: 36, Rb: 37, Sr: 38, Y: 39, Zr: 40, Nb: 41, Mo: 42,
  Tc: 43, Ru: 44, Rh: 45, Pd: 46, Ag: 47, Cd: 48, In: 49, Sn: 50,
  Sb: 51, Te: 52, I: 53, Xe: 54
};

function parseXYZ(xyzString) {
  // Parse XYZ format - skip first 2 lines (count + comment), extract element symbols
  return xyzString
    .trim()
    .split('\n')
    .slice(2)
    .map(line => {
      const tok = line.trim().split(/\s+/)[0] || '';
      return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
    })
    .filter(s => s in ATOMIC_NUMBERS);
}

function validateMolecule(atoms, charge, spinMultiplicity) {
  const totalElectrons = atoms.reduce((sum, el) => {
    const sym = el.charAt(0).toUpperCase() + el.slice(1).toLowerCase();
    return sum + (ATOMIC_NUMBERS[sym] || 0);
  }, 0) - charge;

  if (totalElectrons <= 0) {
    return { valid: false, error: `Invalid charge: no electrons remaining` };
  }

  // Key rule: (electrons + multiplicity) must be odd
  if ((totalElectrons + spinMultiplicity) % 2 === 0) {
    return {
      valid: false,
      error: `${totalElectrons} electrons incompatible with spin ${spinMultiplicity}`
    };
  }

  const unpaired = spinMultiplicity - 1;
  if (unpaired > totalElectrons) {
    return {
      valid: false,
      error: `Spin ${spinMultiplicity} requires ${unpaired} unpaired electrons, only ${totalElectrons} available`
    };
  }

  return { valid: true, error: null };
}

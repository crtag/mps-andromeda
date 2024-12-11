// molecule-parser.test.js
const fs = require("fs");
const path = require("path");
const {extractMoleculeInput, extractSimulationResults} = require("./outputOperations");
const {describe, test, expect, beforeAll} = require("@jest/globals");

// Helper function to load test files
function loadTestFile(filename) {
    return fs.readFileSync(path.join(__dirname, "test-files", filename), "utf8");
}

describe("Molecule Parser Tests", () => {
    let successTestFileContent;

    beforeAll(() => {
        // Load your test file
        successTestFileContent = loadTestFile("quick-success.out");
    });

    describe("extractMoleculeInput", () => {
        test("extracts correct atom number and electrons from real test file", () => {
            const result = extractMoleculeInput(successTestFileContent);
            expect(result).toMatchSnapshot();
        });

        test("returns null values for invalid input", () => {
            const result = extractMoleculeInput("invalid content");
            expect(result).toEqual({
                totalAtomNumber: null,
                totalElectrons: null,
            });
        });

        test("handles empty input", () => {
            const result = extractMoleculeInput("");
            expect(result).toEqual({
                totalAtomNumber: null,
                totalElectrons: null,
            });
        });
    });
});

describe("extractSimulationResults", () => {
    let successTestFileContent;

    beforeAll(() => {
        // Load your test file
        successTestFileContent = loadTestFile("quick-success.out");
    });

    test("extracts simulation results from real test file", () => {
        const result = extractSimulationResults(successTestFileContent);
        expect(result).toMatchSnapshot();
    });

    test("returns null values for invalid input", () => {
        const result = extractSimulationResults("invalid content");
        expect(result).toEqual({
            optimizedGeometry: null,
            minimizedEnergy: null,
            totalTime: null,
        });
    });

    test("handles empty input", () => {
        const result = extractSimulationResults("");
        expect(result).toEqual({
            optimizedGeometry: null,
            minimizedEnergy: null,
            totalTime: null,
        });
    });

    test("handles partial results correctly", () => {
        const partialContent = `
            ================ OPTIMIZED GEOMETRY INFORMATION ==============
            OPTIMIZED GEOMETRY IN CARTESIAN
            ELEMENT X Y Z
            C -11.955388 4.422024 -0.357850
            C -9.634206 2.630167 0.650537
            
            FORCE
            MINIMIZED ENERGY = -840.694818961
        `.trim();

        const result = extractSimulationResults(partialContent);
        expect(result).toEqual({
            optimizedGeometry: "C -11.955388 4.422024 -0.357850\nC -9.634206 2.630167 0.650537",
            minimizedEnergy: -840.694818961,
            totalTime: null,
        });
    });

    test("correctly trims geometry output", () => {
        const inputWithSpaces = `
            OPTIMIZED GEOMETRY IN CARTESIAN
            ELEMENT X Y Z
              C    -11.955388    4.422024    -0.357850   
               C     -9.634206     2.630167      0.650537    
            FORCE
        `.trim();

        const result = extractSimulationResults(inputWithSpaces);
        expect(result.optimizedGeometry)
            .toBe("C    -11.955388    4.422024    -0.357850\nC     -9.634206     2.630167      0.650537");
    });

    test("correctly extracts minimized energy from test file", () => {
        const result = extractSimulationResults(successTestFileContent);
        expect(result.minimizedEnergy).toBe(-840.694818961);
    });

    test("correctly extracts total time from test file", () => {
        const result = extractSimulationResults(successTestFileContent);
        expect(result.totalTime).toBe(3967.181602000);
    });
});

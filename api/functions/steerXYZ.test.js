const {steerXYZ} = require("./outputOperations");

describe("steerXYZ", () => {
    // Helper function to parse XYZ result and extract coordinates for testing
    function parseXYZResult(xyzString) {
        return xyzString.split("\n").map(line => {
            const tokens = line.trim().split(/\s+/);
            return {
                type: tokens[0],
                x: parseFloat(tokens[1]),
                y: parseFloat(tokens[2]),
                z: parseFloat(tokens[3])
            };
        });
    }

    // Helper function to check if two numbers are close within tolerance
    function expectClose(actual, expected, tolerance = 1e-7) {
        expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
    }

    describe("Direction Tests", () => {
        test("Pure +X direction", () => {
            const input = "C 1.0 2.0 3.0\nN 4.0 5.0 6.0";
            const result = steerXYZ(input, "1 2", 0.25, "[1,0,0]");
            const atoms = parseXYZResult(result);
            
            // Both atoms should have x += 0.25, y,z unchanged
            expectClose(atoms[0].x, 1.25);
            expectClose(atoms[0].y, 2.0);
            expectClose(atoms[0].z, 3.0);
            
            expectClose(atoms[1].x, 4.25);
            expectClose(atoms[1].y, 5.0);
            expectClose(atoms[1].z, 6.0);
        });

        test("XY diagonal", () => {
            const input = "C 0.0 0.0 0.0";
            const result = steerXYZ(input, "1", 0.2, "[1 1 0]");
            const atoms = parseXYZResult(result);
            
            // Expected: x ≈ 0.141421356, y ≈ 0.141421356, z = 0
            expectClose(atoms[0].x, 0.141421356);
            expectClose(atoms[0].y, 0.141421356);
            expectClose(atoms[0].z, 0.0);
        });

        test("Body diagonal", () => {
            const input = "C 1.0 2.0 3.0";
            const stepSize = Math.sqrt(3); // ≈1.732050808
            const result = steerXYZ(input, "1", stepSize, "[1,1,1]");
            const atoms = parseXYZResult(result);
            
            // Each axis should += 1.0 (since u = (1/√3, 1/√3, 1/√3) and step = √3)
            expectClose(atoms[0].x, 2.0);
            expectClose(atoms[0].y, 3.0);
            expectClose(atoms[0].z, 4.0);
        });

        test("Weighted direction", () => {
            const input = "C 0.0 0.0 0.0";
            const stepSize = Math.sqrt(5); // ≈2.236067978
            const result = steerXYZ(input, "1", stepSize, "[2,1,0]");
            const atoms = parseXYZResult(result);
            
            // Expected: x += 2, y += 1, z += 0
            expectClose(atoms[0].x, 2.0);
            expectClose(atoms[0].y, 1.0);
            expectClose(atoms[0].z, 0.0);
        });

        test("Negative direction", () => {
            const input = "C 1.0 1.0 1.0";
            const result = steerXYZ(input, "1", 0.3, "[0,-1,0]");
            const atoms = parseXYZResult(result);
            
            // Expected: y -= 0.3, x,z unchanged
            expectClose(atoms[0].x, 1.0);
            expectClose(atoms[0].y, 0.7);
            expectClose(atoms[0].z, 1.0);
        });
    });

    describe("Multiple Atoms and De-duplication", () => {
        test("Multiple atoms with de-duplication", () => {
            const input = "C 0.0 0.0 0.0\nN 1.0 1.0 1.0\nO 2.0 2.0 2.0";
            const result = steerXYZ(input, "1,2,2;3", 0.1, "[0 0 1]");
            const atoms = parseXYZResult(result);
            
            // All three atoms should get z += 0.1 exactly once
            expectClose(atoms[0].x, 0.0);
            expectClose(atoms[0].y, 0.0);
            expectClose(atoms[0].z, 0.1);
            
            expectClose(atoms[1].x, 1.0);
            expectClose(atoms[1].y, 1.0);
            expectClose(atoms[1].z, 1.1);
            
            expectClose(atoms[2].x, 2.0);
            expectClose(atoms[2].y, 2.0);
            expectClose(atoms[2].z, 2.1);
        });
    });

    describe("Error Cases", () => {
        test("Bad HKL - not 3 components", () => {
            const input = "C 0.0 0.0 0.0";
            expect(() => {
                steerXYZ(input, "1", 0.1, "[1 0]");
            }).toThrow("Invalid HKL format '[1 0]': Expected exactly 3 components");
        });

        test("Zero vector HKL", () => {
            const input = "C 0.0 0.0 0.0";
            expect(() => {
                steerXYZ(input, "1", 0.1, "[0,0,0]");
            }).toThrow("Invalid HKL format '[0,0,0]': Direction cannot be zero vector");
        });

        test("Out-of-range atom index - too low", () => {
            const input = "C 0.0 0.0 0.0\nN 1.0 1.0 1.0\nO 2.0 2.0 2.0";
            expect(() => {
                steerXYZ(input, "0 2", 0.1, "[1,0,0]");
            }).toThrow("Atom index 0 out of bounds");
        });

        test("Out-of-range atom index - too high", () => {
            const input = "C 0.0 0.0 0.0\nN 1.0 1.0 1.0\nO 2.0 2.0 2.0";
            expect(() => {
                steerXYZ(input, "1 5", 0.1, "[1,0,0]");
            }).toThrow("Atom index 5 out of bounds");
        });

        test("Invalid XYZ format - wrong number of tokens", () => {
            const input = "C 0.0 0.0"; // Missing z coordinate
            expect(() => {
                steerXYZ(input, "1", 0.1, "[1,0,0]");
            }).toThrow("Expected 4 tokens");
        });

        test("Invalid coordinates - non-numeric", () => {
            const input = "C abc 0.0 0.0";
            expect(() => {
                steerXYZ(input, "1", 0.1, "[1,0,0]");
            }).toThrow("Invalid coordinates - must be finite numbers");
        });

        test("Zero stepSize", () => {
            const input = "C 0.0 0.0 0.0";
            expect(() => {
                steerXYZ(input, "1", 0, "[1,0,0]");
            }).toThrow("stepSize must be a finite non-zero number");
        });

        test("Non-finite stepSize", () => {
            const input = "C 0.0 0.0 0.0";
            expect(() => {
                steerXYZ(input, "1", NaN, "[1,0,0]");
            }).toThrow("stepSize must be a finite non-zero number");
        });
    });

    describe("StepSize Policy", () => {
        test("Negative stepSize allowed - reverse direction", () => {
            const input = "C 0.0 0.0 0.0";
            const result = steerXYZ(input, "1", -0.1, "[0 0 1]");
            const atoms = parseXYZResult(result);
            
            // Expected: z -= 0.1
            expectClose(atoms[0].x, 0.0);
            expectClose(atoms[0].y, 0.0);
            expectClose(atoms[0].z, -0.1);
        });
    });

    describe("Format Validation", () => {
        test("Output format uses single spaces", () => {
            const input = "C 1.0 2.0 3.0";
            const result = steerXYZ(input, "1", 0.1, "[1,0,0]");
            
            // Should have single spaces between tokens
            expect(result).toBe("C 1.1 2 3");
        });

        test("Multiple atoms format consistency", () => {
            const input = "C 1.0 2.0 3.0\nN 4.0 5.0 6.0";
            const result = steerXYZ(input, "1 2", 0.1, "[1,0,0]");
            
            const lines = result.split("\n");
            expect(lines).toHaveLength(2);
            expect(lines[0]).toBe("C 1.1 2 3");
            expect(lines[1]).toBe("N 4.1 5 6");
        });
    });

    describe("Edge Cases", () => {
        test("Single atom", () => {
            const input = "H 0.0 0.0 0.0";
            const result = steerXYZ(input, "1", 1.0, "[1,0,0]");
            const atoms = parseXYZResult(result);
            
            expectClose(atoms[0].x, 1.0);
            expectClose(atoms[0].y, 0.0);
            expectClose(atoms[0].z, 0.0);
        });

        test("Empty atom selection string handled gracefully", () => {
            const input = "C 0.0 0.0 0.0";
            expect(() => {
                steerXYZ(input, "", 0.1, "[1,0,0]");
            }).toThrow("No atom indices found");
        });

        test("HKL with different bracket styles", () => {
            const input = "C 0.0 0.0 0.0";
            
            // Test without brackets
            const result1 = steerXYZ(input, "1", 1.0, "1 0 0");
            const atoms1 = parseXYZResult(result1);
            expectClose(atoms1[0].x, 1.0);
            
            // Test with brackets
            const result2 = steerXYZ(input, "1", 1.0, "[1 0 0]");
            const atoms2 = parseXYZResult(result2);
            expectClose(atoms2[0].x, 1.0);
            
            // Test with commas
            const result3 = steerXYZ(input, "1", 1.0, "[1,0,0]");
            const atoms3 = parseXYZResult(result3);
            expectClose(atoms3[0].x, 1.0);
        });
    });

    describe("Compact HKL Format Support", () => {
        test("Compact format [01-1] - first zero, second positive, third negative", () => {
            const input = "C 0.0 0.0 0.0";
            const result = steerXYZ(input, "1", Math.sqrt(2), "[01-1]"); // norm = sqrt(0^2 + 1^2 + (-1)^2) = sqrt(2)
            const atoms = parseXYZResult(result);
            
            // Expected: x += 0, y += 1, z += -1
            expectClose(atoms[0].x, 0.0);
            expectClose(atoms[0].y, 1.0);
            expectClose(atoms[0].z, -1.0);
        });

        test("Compact format [011] - all positive", () => {
            const input = "C 0.0 0.0 0.0";
            const result = steerXYZ(input, "1", Math.sqrt(2), "[011]"); // norm = sqrt(0^2 + 1^2 + 1^2) = sqrt(2)
            const atoms = parseXYZResult(result);
            
            // Expected: x += 0, y += 1, z += 1
            expectClose(atoms[0].x, 0.0);
            expectClose(atoms[0].y, 1.0);
            expectClose(atoms[0].z, 1.0);
        });

        test("Compact format [10-1] - first positive, second zero, third negative", () => {
            const input = "C 0.0 0.0 0.0";
            const result = steerXYZ(input, "1", Math.sqrt(2), "[10-1]"); // norm = sqrt(1^2 + 0^2 + (-1)^2) = sqrt(2)
            const atoms = parseXYZResult(result);
            
            // Expected: x += 1, y += 0, z += -1
            expectClose(atoms[0].x, 1.0);
            expectClose(atoms[0].y, 0.0);
            expectClose(atoms[0].z, -1.0);
        });

        test("Compact format [-111] - first negative, others positive", () => {
            const input = "C 0.0 0.0 0.0";
            const result = steerXYZ(input, "1", Math.sqrt(3), "[-111]"); // norm = sqrt((-1)^2 + 1^2 + 1^2) = sqrt(3)
            const atoms = parseXYZResult(result);
            
            // Expected: x += -1, y += 1, z += 1
            expectClose(atoms[0].x, -1.0);
            expectClose(atoms[0].y, 1.0);
            expectClose(atoms[0].z, 1.0);
        });

        test("Compact format [1-11] - middle component negative", () => {
            const input = "C 0.0 0.0 0.0";
            const result = steerXYZ(input, "1", Math.sqrt(3), "[1-11]"); // norm = sqrt(1^2 + (-1)^2 + 1^2) = sqrt(3)
            const atoms = parseXYZResult(result);
            
            // Expected: x += 1, y += -1, z += 1
            expectClose(atoms[0].x, 1.0);
            expectClose(atoms[0].y, -1.0);
            expectClose(atoms[0].z, 1.0);
        });

        test("Compact format [11-1] - last component negative", () => {
            const input = "C 0.0 0.0 0.0";
            const result = steerXYZ(input, "1", Math.sqrt(3), "[11-1]"); // norm = sqrt(1^2 + 1^2 + (-1)^2) = sqrt(3)
            const atoms = parseXYZResult(result);
            
            // Expected: x += 1, y += 1, z += -1
            expectClose(atoms[0].x, 1.0);
            expectClose(atoms[0].y, 1.0);
            expectClose(atoms[0].z, -1.0);
        });

        test("Invalid format with non-numeric characters throws error", () => {
            const input = "C 0.0 0.0 0.0";
            expect(() => {
                steerXYZ(input, "1", 0.1, "[abc]");
            }).toThrow("Invalid HKL format '[abc]': Expected exactly 3 components, got 1 from parsed tokens [abc]");
        });

        test("Invalid format with mixed alphanumeric throws error", () => {
            const input = "C 0.0 0.0 0.0";
            expect(() => {
                steerXYZ(input, "1", 0.1, "[1a2]");
            }).toThrow("Invalid HKL format '[1a2]': Expected exactly 3 components, got 1 from parsed tokens [1a2]");
        });

        test("Invalid format shows expected formats in error", () => {
            const input = "C 0.0 0.0 0.0";
            expect(() => {
                steerXYZ(input, "1", 0.1, "[1x]");
            }).toThrow("Supported formats: '[1 1 0]', '[1,1,0]', '[110]', '1 1 0', etc.");
        });
    });

    describe("Enhanced Error Messages", () => {
        test("Improved error message for wrong component count", () => {
            const input = "C 0.0 0.0 0.0";
            expect(() => {
                steerXYZ(input, "1", 0.1, "[1 0]");
            }).toThrow(
                `Invalid HKL format '[1 0]': Expected exactly 3 components, ` +
                `got 2 from parsed tokens [1, 0]. Supported formats: '[1 1 0]', '[1,1,0]', '[110]', '1 1 0', etc.`);
        });

        test("Improved error message for invalid component", () => {
            const input = "C 0.0 0.0 0.0";
            expect(() => {
                steerXYZ(input, "1", 0.1, "[1 x 0]");
            }).toThrow("Invalid HKL format '[1 x 0]': Component 'x' at position 2 is not a valid integer");
        });

        test("Improved error message for zero vector", () => {
            const input = "C 0.0 0.0 0.0";
            expect(() => {
                steerXYZ(input, "1", 0.1, "[0,0,0]");
            }).toThrow("Invalid HKL format '[0,0,0]': Direction cannot be zero vector [0,0,0]");
        });
    });
});
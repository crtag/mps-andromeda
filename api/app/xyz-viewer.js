// XYZ molecular viewer - combines core functionality and modal wrapper
// Standalone viewer loads this file and uses only createXYZViewerCore

// ============================================================================
// CORE VIEWER FUNCTIONALITY
// ============================================================================

function createXYZViewerCore(containerId, infoId, distanceInfoId, frameInfoId) {
    return {
        viewer: null,
        frames: [],
        currentFrame: 0,
        selectedAtoms: [],
        selectedSerials: [], // Track selected atom serial numbers across frames
        isPlaying: false,
        playInterval: null,
        containerId: containerId,
        infoId: infoId,
        distanceInfoId: distanceInfoId,
        frameInfoId: frameInfoId,

        // Parse XYZ data into frames
        parseFrames(xyzData) {
            this.frames = [];
            const lines = xyzData.trim().split('\n');
            let i = 0;

            while (i < lines.length) {
                const atomCount = parseInt(lines[i]);
                if (isNaN(atomCount)) break;

                const frameLines = lines.slice(i, i + atomCount + 2);
                this.frames.push(frameLines.join('\n'));
                i += atomCount + 2;
            }
        },

        // Initialize 3Dmol viewer
        initViewer() {
            const container = document.getElementById(this.containerId);
            container.innerHTML = ''; // Clear previous

            const config = {
                backgroundColor: 'white'
            };

            this.viewer = $3Dmol.createViewer(container, config);
            this.selectedAtoms = [];
        },

        // Render specific frame
        renderFrame(frameIndex) {
            if (frameIndex < 0 || frameIndex >= this.frames.length) return;

            this.currentFrame = frameIndex;
            this.viewer.clear();

            // Add model
            this.viewer.addModel(this.frames[frameIndex], 'xyz');

            // Style: stick bonds + small spheres
            this.viewer.setStyle({}, {stick: {}, sphere: {radius: 0.3}});

            // Setup click handler for atom selection
            const self = this;
            this.viewer.setClickable({}, true, function(atom) {
                self.handleAtomClick(atom);
            });

            // Restore selection from previous frame
            if (this.selectedSerials.length > 0) {
                this.selectedAtoms = [];
                const allAtoms = this.viewer.getModel().selectedAtoms({});
                this.selectedSerials.forEach(serial => {
                    const atom = allAtoms.find(a => a.serial === serial);
                    if (atom) {
                        this.selectedAtoms.push(atom);
                    }
                });
                this.updateSelection();

                // Update distance info if two atoms selected
                if (this.selectedAtoms.length === 2) {
                    this.showDistance();
                } else if (this.selectedAtoms.length === 1) {
                    this.showAtomInfo(this.selectedAtoms[0]);
                }
            } else {
                this.clearInfo();
            }

            this.viewer.render();
        },

        // Handle atom click selection
        handleAtomClick(atom) {
            // Check if atom is already selected
            const existingIndex = this.selectedSerials.indexOf(atom.serial);

            if (existingIndex !== -1) {
                // Atom already selected - deselect it
                this.selectedAtoms.splice(existingIndex, 1);
                this.selectedSerials.splice(existingIndex, 1);
            } else {
                // Add to selected atoms
                this.selectedAtoms.push(atom);
                this.selectedSerials.push(atom.serial);

                // Keep only last 2 atoms
                if (this.selectedAtoms.length > 2) {
                    this.selectedAtoms.shift();
                    this.selectedSerials.shift();
                }
            }

            // Update visualization
            this.updateSelection();

            // Show info
            if (this.selectedAtoms.length === 0) {
                this.clearInfo();
            } else if (this.selectedAtoms.length === 1) {
                this.showAtomInfo(this.selectedAtoms[0]);
            } else if (this.selectedAtoms.length === 2) {
                this.showDistance();
            }
        },

        // Update atom selection visualization
        updateSelection() {
            // Reset all atoms to default style
            this.viewer.setStyle({}, {stick: {}, sphere: {radius: 0.3}});

            // Remove previous labels and shapes
            this.viewer.removeAllLabels();
            this.viewer.removeAllShapes();

            // Highlight selected atoms with labels
            this.selectedAtoms.forEach((atom) => {
                // Highlight atom
                this.viewer.setStyle(
                    {serial: atom.serial},
                    {stick: {}, sphere: {radius: 0.4, color: 'magenta'}}
                );

                // Add label with atom index from XYZ (1-based) and element
                const atomIndex = atom.serial + 1;
                const labelText = `#${atomIndex}\n${atom.elem}`;
                this.viewer.addLabel(labelText, {
                    position: {x: atom.x, y: atom.y, z: atom.z},
                    backgroundColor: 'magenta',
                    backgroundOpacity: 0.8,
                    fontColor: 'white',
                    fontSize: 14,
                    showBackground: true
                });
            });

            // Draw line between two selected atoms
            if (this.selectedAtoms.length === 2) {
                const [atom1, atom2] = this.selectedAtoms;
                this.viewer.addCylinder({
                    start: {x: atom1.x, y: atom1.y, z: atom1.z},
                    end: {x: atom2.x, y: atom2.y, z: atom2.z},
                    radius: 0.1,
                    color: 'magenta',
                    opacity: 0.6
                });
            }

            this.viewer.render();
        },

        // Show atom information
        showAtomInfo(atom) {
            const info = `Atom #${atom.serial + 1}: ${atom.elem} at (${atom.x.toFixed(2)}, ${atom.y.toFixed(2)}, ${atom.z.toFixed(2)}) Å`;
            document.getElementById(this.infoId).textContent = info;
            if (this.distanceInfoId) {
                document.getElementById(this.distanceInfoId).textContent = '';
            }
        },

        // Calculate and show distance between two atoms
        showDistance() {
            const [atom1, atom2] = this.selectedAtoms;
            const dx = atom1.x - atom2.x;
            const dy = atom1.y - atom2.y;
            const dz = atom1.z - atom2.z;
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

            const info1 = `Atom #${atom1.serial + 1}: ${atom1.elem} at (${atom1.x.toFixed(2)}, ${atom1.y.toFixed(2)}, ${atom1.z.toFixed(2)}) Å`;
            const info2 = `Atom #${atom2.serial + 1}: ${atom2.elem} at (${atom2.x.toFixed(2)}, ${atom2.y.toFixed(2)}, ${atom2.z.toFixed(2)}) Å`;
            const distInfo = `Distance: ${distance.toFixed(3)} Å`;

            document.getElementById(this.infoId).textContent = `${info1}\n${info2}\n${distInfo}`;
            if (this.distanceInfoId) {
                document.getElementById(this.distanceInfoId).textContent = '';
            }
        },

        // Clear info display
        clearInfo() {
            document.getElementById(this.infoId).textContent = 'Click atoms to measure distance';
            if (this.distanceInfoId) {
                document.getElementById(this.distanceInfoId).textContent = '';
            }
        },

        // Trajectory controls
        nextFrame() {
            const nextIndex = (this.currentFrame + 1) % this.frames.length;
            this.renderFrame(nextIndex);
            this.updateFrameInfo();
        },

        prevFrame() {
            const prevIndex = (this.currentFrame - 1 + this.frames.length) % this.frames.length;
            this.renderFrame(prevIndex);
            this.updateFrameInfo();
        },

        updateFrameInfo() {
            if (this.frameInfoId) {
                document.getElementById(this.frameInfoId).textContent =
                    `Frame ${this.currentFrame + 1} / ${this.frames.length}`;
            }
        },

        togglePlay(playBtnId) {
            if (this.isPlaying) {
                clearInterval(this.playInterval);
                this.isPlaying = false;
                if (playBtnId) {
                    document.getElementById(playBtnId).textContent = '▶';
                }
            } else {
                this.playInterval = setInterval(() => {
                    this.nextFrame();
                }, 200);
                this.isPlaying = true;
                if (playBtnId) {
                    document.getElementById(playBtnId).textContent = '⏸';
                }
            }
        },

        // Reset selection
        resetSelection() {
            this.selectedAtoms = [];
            this.selectedSerials = [];
        }
    };
}

// Make core globally accessible for standalone viewer
window.createXYZViewerCore = createXYZViewerCore;

// ============================================================================
// MODAL WRAPPER (used by main app, ignored by standalone)
// ============================================================================

const XYZViewer = {
    core: null,
    currentUrl: null,
    currentFilename: null,

    // Initialize and show modal with XYZ data
    async open(xyzUrl, filename) {
        try {
            // Store current URL and filename for "Open in New Tab"
            this.currentUrl = xyzUrl;
            this.currentFilename = filename;

            // Fetch XYZ file
            const response = await fetch(xyzUrl);
            const xyzData = await response.text();

            // Show modal first
            document.getElementById('xyz-viewer-modal').style.display = 'flex';
            document.getElementById('xyz-modal-title').textContent = filename;

            // Set download link
            const downloadBtn = document.getElementById('xyz-download-btn');
            downloadBtn.href = xyzUrl;
            downloadBtn.download = filename;

            // Create core viewer instance
            this.core = createXYZViewerCore(
                'xyz-viewer-container',
                'xyz-atom-info',
                'xyz-distance-info',
                'xyz-frame-info'
            );

            // Reset selection
            this.core.resetSelection();

            // Parse frames
            this.core.parseFrames(xyzData);
            console.log('Parsed', this.core.frames.length, 'frames');

            // Wait for next frame to ensure container has dimensions
            await new Promise(resolve => requestAnimationFrame(resolve));

            // Initialize 3Dmol viewer (now that container is visible)
            this.core.initViewer();

            // Render first frame
            this.core.renderFrame(0);

            // Set initial zoom (only once)
            this.core.viewer.zoomTo();

            // Translate camera slightly down to account for header taking up top space
            // This shifts the view so molecule appears centered in visible area
            this.core.viewer.translate(0, -20, 0);
            this.core.viewer.render();

            // Setup trajectory controls if multi-frame
            if (this.core.frames.length > 1) {
                console.log('Showing trajectory controls');
                document.getElementById('xyz-trajectory-controls').style.display = 'flex';
                this.core.updateFrameInfo();
            } else {
                console.log('Single frame - hiding trajectory controls');
                document.getElementById('xyz-trajectory-controls').style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading XYZ file:', error);
            alert('Failed to load XYZ file: ' + error.message);
            this.close();
        }
    },

    // Trajectory controls
    nextFrame() {
        if (this.core) {
            this.core.nextFrame();
        }
    },

    prevFrame() {
        if (this.core) {
            this.core.prevFrame();
        }
    },

    togglePlay() {
        if (this.core) {
            this.core.togglePlay('xyz-play-btn');
        }
    },

    // Close modal
    close() {
        if (this.core && this.core.isPlaying) {
            this.core.togglePlay('xyz-play-btn');
        }
        document.getElementById('xyz-viewer-modal').style.display = 'none';
        if (this.core && this.core.viewer) {
            this.core.viewer.clear();
        }
    },

    // Open viewer in new tab
    openInNewTab() {
        if (!this.currentUrl || !this.currentFilename) {
            console.error('No XYZ file currently loaded');
            return;
        }

        // Create URL with parameters for the standalone viewer
        const params = new URLSearchParams({
            url: this.currentUrl,
            filename: this.currentFilename
        });

        // Open xyz-viewer-standalone.html in new tab
        window.open(`xyz-viewer-standalone.html?${params.toString()}`, '_blank');
    }
};

// Make modal globally accessible
window.XYZViewer = XYZViewer;

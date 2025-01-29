let cadFrameEl = document.getElementById('cad-frame');
let gizmoFrameEl = document.getElementById('gizmo-frame');
let defaultViewerStyle = {stick:{}, sphere:{radius: 0.5}, clicksphere:{radius: 0.5}};
let selectedAtomStyle = {sphere: {color: '#FF69B4', radius: 0.75 }};
const atomsSelectionSet = new Set();
let alignmentLineVec = null;
let alignmentPlaneVec = null;
let alignmentAxis = null;
let modelXYZfileName = null;
let xyzPlanes = null;

// global viewer object
let mainViewer = null;
let gizmoViewer = null;

const elements = {
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('fileInput'),
};

// Event Handlers
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}


function highlight() {
    elements.dropZone.classList.add('drag-over');
}

function unhighlight() {
    elements.dropZone.classList.remove('drag-over');
}

function handleDrop(e) {
    const file = e.dataTransfer.files[0];
    handleFile(file);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    handleFile(file);
}

// File Processing
function handleFile(file) {
    if (!file.name.endsWith('.xyz')) {
        showStatus('Please upload a file with .xyz extension', 'error');
        return;
    }

    // retain file name globally
    modelXYZfileName = file.name;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const content = e.target.result;
        console.log(content);
        renderXYZdata(mainViewer, content);
    };
    reader.readAsText(file);
}

// Event Listeners
function initializeUpload() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        elements.dropZone.addEventListener(eventName, preventDefaults);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        elements.dropZone.addEventListener(eventName, highlight);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        elements.dropZone.addEventListener(eventName, unhighlight);
    });

    elements.dropZone.addEventListener('drop', handleDrop);
    elements.dropZone.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileSelect);
}

function initCad() {
    let viewer = $3Dmol.createViewer(cadFrameEl, { backgroundColor: '#EEEEEE' });
    viewer.setProjection('orthographic');
    const defaultView = [
        0,    // pos.x - centered
        0,    // pos.y - centered
        10,   // pos.z - pulled back to see scene
        0,    // rotationGroup.z
        0.3826834,   // q.x - ~45° rotation in X
        0,          // q.y
        0.3826834,   // q.z - ~45° rotation in Z
        0.8660254    // q.w - completes the quaternion for isometric
    ];
    viewer.setView(defaultView);
    mainViewer = viewer;

    gizmoViewer = $3Dmol.createViewer(gizmoFrameEl, {backgroundColor: '#FFFFFF', backgroundAlpha: 0.5, nomouse: true});

    // add hidden grid planes
    xyzPlanes = addPlanes(viewer);
    // zero point
    viewer.addLine({start:{x:-0.5,y:0,z:0},end:{x:0.5,y:0,z:0}, color: '#FF0000' });
    viewer.addLine({start:{x:0,y:-0.5,z:0},end:{x:0,y:0.5,z:0}, color: '#FF0000' });
    viewer.addLine({start:{x:0,y:0,z:-0.5},end:{x:0,y:0,z:0.5}, color: '#FF0000' });
    viewer.addLabel('0,0,0', { alignment: 'bottomRight', showBackground: false, fontSize: 8, fontColor: '#FF0000', borderColor: '#FF0000', borderThickness: 0.1, position: { x: 0, y: 0, z: 0 }, backgroundColor: 'white' });
    viewer.render();
    viewer.center();

    return {viewer, gizmoViewer};
}

function initGizmo({viewer, gizmoViewer}) {
    viewer.setViewChangeCallback((e) => {
        const rotationOnly = e.slice(4);
        const gizmoZoom = gizmoViewer.getView()[3];
        gizmoViewer.setView([0,0,0,gizmoZoom, ...rotationOnly]);
        gizmoViewer.render();
    });

    gizmoViewer.addArrow({start: {x: 0, y: 0, z: 0}, end: {x: 4, y: 0, z: 0}, color: 'red', radius: 0.3});
    gizmoViewer.addArrow({start: {x: 0, y: 0, z: 0}, end: {x: 0, y: 4, z: 0}, color: 'green', radius: 0.3});
    gizmoViewer.addArrow({start: {x: 0, y: 0, z: 0}, end: {x: 0, y: 0, z: 4}, color: 'blue', radius: 0.3});
    gizmoViewer.zoomTo();
    gizmoViewer.render();
}

function addPlanes(viewer, hidden = true, gridSize = 50, gridSpacing = 1) {
    const xy = [], xz = [], yz = [];
    for (let i = 0; i <= gridSize; i += gridSpacing) {
        // XY Plane (constant Z)
        xy.push(viewer.addLine({ start: { x: -i, y: -gridSize, z: 0 }, end: { x: -i, y: gridSize, z: 0 }, color: '#CCCCCC', hidden }));
        xy.push(viewer.addLine({ start: { x: i, y: -gridSize, z: 0 }, end: { x: i, y: gridSize, z: 0 }, color: '#CCCCCC', hidden }));
        xy.push(viewer.addLine({ start: { x: -gridSize, y: -i, z: 0 }, end: { x: gridSize, y: -i, z: 0 }, color: '#CCCCCC', hidden }));
        xy.push(viewer.addLine({ start: { x: -gridSize, y: i, z: 0 }, end: { x: gridSize, y: i, z: 0 }, color: '#CCCCCC', hidden }));

        // XZ Plane (constant Y)
        xz.push(viewer.addLine({ start: { x: -i, y: 0, z: -gridSize }, end: { x: -i, y: 0, z: gridSize }, color: '#99CCFF', hidden }));
        xz.push(viewer.addLine({ start: { x: i, y: 0, z: -gridSize }, end: { x: i, y: 0, z: gridSize }, color: '#99CCFF', hidden }));
        xz.push(viewer.addLine({ start: { x: -gridSize, y: 0, z: -i }, end: { x: gridSize, y: 0, z: -i }, color: '#99CCFF', hidden }));
        xz.push(viewer.addLine({ start: { x: -gridSize, y: 0, z: i }, end: { x: gridSize, y: 0, z: i }, color: '#99CCFF', hidden }));

        // YZ Plane (constant X)
        yz.push(viewer.addLine({ start: { x: 0, y: -i, z: -gridSize }, end: { x: 0, y: -i, z: gridSize }, color: '#FFCC99', hidden }));
        yz.push(viewer.addLine({ start: { x: 0, y: i, z: -gridSize }, end: { x: 0, y: i, z: gridSize }, color: '#FFCC99', hidden }));
        yz.push(viewer.addLine({ start: { x: 0, y: -gridSize, z: -i }, end: { x: 0, y: gridSize, z: -i }, color: '#FFCC99', hidden }));
        yz.push(viewer.addLine({ start: { x: 0, y: -gridSize, z: i }, end: { x: 0, y: gridSize, z: i }, color: '#FFCC99', hidden }));
    }
    viewer.render();
    return { xy, xz, yz };
}

function togglePlaneVisibility(viewer, plane, visible) {
    console.log(`Toggling ${plane} plane visibility: ${visible}`);
    xyzPlanes[plane].forEach(line => line.updateStyle({ hidden: !visible }));
    viewer.render();
}

function alignToDirection(viewer, direction) {
    console.log(`Aligning to direction: ${direction}`);

    // Step 0: Strip brackets
    let hkl = direction.substring(1, direction.length - 1); // Remove '[' and ']'

    // Step 1: Determine direction (sign)
    let sign = hkl.includes('-') ? -1 : 1;
    hkl = hkl.replace('-', ''); // Remove the minus sign

    // Step 2: Find the index of "1" to determine the axis
    const axisIndex = hkl.indexOf('1');

    // Get the current view
    const currentView = viewer.getView();
    console.log(`Current view: ${currentView}`);

    // Step 3: Adjust the quaternion and camera position for orthogonal alignment

    // Update quaternion and camera position based on the axis
    if (axisIndex === 0) {
        // X-axis
        currentView[4] = 0;      // qx
        currentView[5] = 0.7071 * sign; // qy (flip for direction)
        currentView[6] = 0;      // qz
        currentView[7] = 0.7071; // qw
        currentView[0] = sign * Math.abs(currentView[0]); // Position along X-axis
        currentView[1] = 0; // Reset Y-axis
        currentView[2] = 0; // Reset Z-axis
    } else if (axisIndex === 1) {
        // Y-axis
        currentView[4] = 0.7071 * sign; // qx (flip for direction)
        currentView[5] = 0;      // qy
        currentView[6] = 0;      // qz
        currentView[7] = 0.7071; // qw
        currentView[1] = sign * Math.abs(currentView[1]); // Position along Y-axis
        currentView[0] = 0; // Reset X-axis
        currentView[2] = 0; // Reset Z-axis
    } else if (axisIndex === 2) {
        // Z-axis
        currentView[4] = 0;    // qx
        currentView[5] = 0;    // qy
        currentView[6] = 0.7071 * sign; // qz (flip for direction)
        currentView[7] = 0.7071; // qw
        currentView[2] = sign * Math.abs(currentView[2]); // Position along Z-axis
        currentView[0] = 0; // Reset X-axis
        currentView[1] = 0; // Reset Y-axis
    }

    // Apply the updated view
    viewer.setView(currentView);

    console.log('Updated view:', currentView);
}


function renderXYZdata(viewer, data) {
    // check if model already exists
    if (viewer.models.length > 0) {
        viewer.clear();
        xyzPlanes = null;
        atomsSelectionSet.clear();
        xyzPlanes = addPlanes(viewer);

        // reset plane grids checkboxes
        document.querySelectorAll('.plane-selector input[name="grid"]')
        .forEach(el => {
            el.checked = false;
        });
    }
    
    let model = viewer.addModel(data, "xyz");
    handleAtomSelection(viewer);

    viewer.center({});
    viewer.zoomTo({model}, 250);
    
    viewer.setStyle({}, defaultViewerStyle);
    viewer.render();
}

function clearAtomsSelection(viewer) {
    atomsSelectionSet.clear();
    // remove any alignment lines or planes
    if (alignmentLineVec) {
        viewer.removeShape(alignmentLineVec);
        alignmentLineVec = null;
    }
    if (alignmentPlaneVec) {
        viewer.removeShape(alignmentPlaneVec);
        alignmentPlaneVec = null;
    }

    viewer.setStyle({}, defaultViewerStyle);
    viewer.render();
}

function handleAtomSelection(viewer) {
    viewer.setClickable({}, true, (atom) => {
        console.log(`Clicked atom`, atom);

        if (atomsSelectionSet.has(atom.index)) {
            atomsSelectionSet.delete(atom.index);
            viewer.setStyle({index: atom.index}, defaultViewerStyle);
        } else if (atomsSelectionSet.size < 3) {
            atomsSelectionSet.add(atom.index);
            viewer.setStyle({index: atom.index}, {...defaultViewerStyle, ...selectedAtomStyle});
        } 

        if (atomsSelectionSet.size === 2 && !alignmentLineVec) {
            let atomsIter = atomsSelectionSet.keys();
            alignmentLineVec = drawArrow(viewer, viewer.models[0].atoms[atomsIter.next().value], viewer.models[0].atoms[atomsIter.next().value]);
        }

        if (atomsSelectionSet.size !== 2 && alignmentLineVec) {
            viewer.removeShape(alignmentLineVec);
            alignmentLineVec = null;
        }

        if (atomsSelectionSet.size === 3 && !alignmentPlaneVec) {
            let atomsIter = atomsSelectionSet.keys();
            alignmentPlaneVec = drawTriangle(viewer, viewer.models[0].atoms[atomsIter.next().value], viewer.models[0].atoms[atomsIter.next().value], viewer.models[0].atoms[atomsIter.next().value]);
        }

        if (atomsSelectionSet.size !== 3 && alignmentPlaneVec) {
            viewer.removeShape(alignmentPlaneVec);
            alignmentPlaneVec = null;
        }

        console.log(`Selection size: ${atomsSelectionSet.size}`);

        if (atomsSelectionSet.size === 1) {
            // enable the translation button .btn-cad-action#translate-button by removing "disabled" class
            document.querySelector('.btn-cad-action#translate-button').classList.remove('disabled');
        } else {
            // disable the translation button .btn-cad-action#translate-button by adding "disabled" class
            document.querySelector('.btn-cad-action#translate-button').classList.add('disabled');
        }

        renderSelectedAtomDetails(viewer);
        viewer.render();
    });
}

function drawArrow(viewer, atom1, atom2) {
    
    debugVectorAngles(atom1, atom2);

    // alignModelToVec(viewer, atom1, atom2);

    const arrow = viewer.addArrow(
        {
            start: {x: atom1.x, y: atom1.y, z: atom1.z},
            end: { x: atom2.x, y: atom2.y, z: atom2.z},
            color: "#40E0D0",
            radiusRatio: 3, 
            midpos: -2.00,
        }
    );
 
    viewer.render();
    return arrow;
}

function drawTriangle(viewer, atom1, atom2, atom3) {

    const vertices = [];
    const normals = [];
    const colors = ['grey', 'grey', 'grey'];

    // Use actual atom positions as vertices
    vertices.push(
        new $3Dmol.Vector3(atom1.x, atom1.y, atom1.z),
        new $3Dmol.Vector3(atom2.x, atom2.y, atom2.z),
        new $3Dmol.Vector3(atom3.x, atom3.y, atom3.z)
    );

    const spec = {vertexArr:vertices, normalArr: normals, faceArr: [0,1,2], color: colors, opacity: 0.75};
    
    meshedTriangle = viewer.addCustom(spec);
    viewer.render();

    return meshedTriangle;
}

function alignModelToVec(viewer, atom1, atom2, alignmentAxis) {
    console.log(atom1, atom2, alignmentAxis);

    const rotationMatrix = calculateAlignmentRotation(
        atom1,  // first point
        atom2,  // second point
        alignmentAxis  // target axis ('(100)', '(010)', or '(001)')
    );

    console.dir(rotationMatrix);

    applyRotationToModel(viewer, rotationMatrix);

    debugVectorAngles(atom1, atom2);
}

// function to download model in XYZ format
// first line a count of atoms
// second line empty
// third line onwards, each line is an atom with element and x, y, z coordinates down to six digits precision
function downloadModelXYZ(viewer) {
    let model = viewer.getModel();
    let xyzData = `${model.selectedAtoms({}).length}\n\n`;
    model.selectedAtoms({}).forEach(atom => {
        xyzData += `${atom.elem}          ${atom.x.toFixed(6)}       ${atom.y.toFixed(6)}       ${atom.z.toFixed(6)}\n`;
    });

    let blob = new Blob([xyzData], {type: 'text/plain'});
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = `aligned-${alignmentAxis}-${modelXYZfileName}`;
    a.click();
}

// document onload event handler
document.addEventListener('DOMContentLoaded', () => {
    initializeUpload();
    
    let {viewer, gizmoViewer} = initCad();
    // renderXYZdata(viewer, mockXYZdata);
    initGizmo({viewer, gizmoViewer});
    renderSelectedAtomDetails(viewer);

    document.getElementById('download-button').addEventListener('click', () => {
        // alert user if there's no model available and abort
        if (viewer.models.length === 0) {
            alert('No model available to download');
            return;
        }

        downloadModelXYZ(viewer);
    });

    document.querySelectorAll('#axis-selector .btn-cad-action').forEach(button => {
        button.addEventListener('click', event => {
            if (atomsSelectionSet.size === 2) {
                const model = viewer.getModel();
                const atoms = model.selectedAtoms({index: Array.from(atomsSelectionSet)});
                console.log(atoms);
                
                alignModelToVec(viewer, atoms[0], atoms[1], event.target.getAttribute('data-miller'));

                viewer.removeShape(alignmentLineVec);
                viewer.setStyle({}, defaultViewerStyle);
                viewer.zoomTo({model}, 250);
                viewer.render();
    
                alignmentLineVec = drawArrow(viewer, atoms[0], atoms[1]);
                viewer.setStyle({index: [atoms[0].index, atoms[1].index]}, {...defaultViewerStyle, ...selectedAtomStyle});
                viewer.render();
    
                renderSelectedAtomDetails(viewer);
            } 
        });
    });

    document.getElementById('translate-button').addEventListener('click', () => {
        if (atomsSelectionSet.size === 1) {
            console.log('Translating model');

            let x = document.getElementById('x-translation').value;
            let y = document.getElementById('y-translation').value;
            let z = document.getElementById('z-translation').value;

            // validate xyz and set to 0 if not a number
            x = isNaN(x) ? 0 : parseFloat(x);
            y = isNaN(y) ? 0 : parseFloat(y);
            z = isNaN(z) ? 0 : parseFloat(z);

            const model = viewer.getModel();
            const atom = model.selectedAtoms({index: Array.from(atomsSelectionSet)[0]})[0];
            console.log(`Selected atom for translation:`, atom);
            console.log(`Translation to: {x: ${x}, y: ${y}, z: ${z}}`);
            
            viewer.setStyle({}, defaultViewerStyle);
            translateModelTo(viewer, atom, {x, y, z});
            viewer.setStyle({index: atom.index}, {...defaultViewerStyle, ...selectedAtomStyle});

            viewer.zoomTo({model}, 250);
            viewer.render();

            renderSelectedAtomDetails(viewer);
        }
    });


    // assign grid checkbox toggle for each plane
    // there are three checkboxes with attributes like name="grid" value="xz"
    document.querySelectorAll('.plane-selector input[name="grid"]')
    .forEach(el => {
        el.addEventListener('change', (e) => {
            const plane = e.target.value;
            const visible = e.target.checked;
            togglePlaneVisibility(viewer, plane, visible);
            console.log(`Toggled ${plane} plane visibility: ${visible}`);
        });
    });

    // Attach event listeners to plane views buttons
    document.querySelectorAll('.view .direction-selector').forEach(button => {
        button.addEventListener('click', event => {
            const view = event.target.getAttribute('data-view');
            alignToDirection(viewer, view);

            viewer.zoomTo({model: viewer.getModel()}, 250);
            viewer.render();
        });
    });

    // Attach event listener to miller-plane-selector buttons
    document.querySelectorAll('#miller-plane-selector .btn-cad-action').forEach(button => {
        button.addEventListener('click', event => {
            if (atomsSelectionSet.size === 3) {
                const millerPlane = event.target.getAttribute('data-miller');
                console.log('Aligning to Miller plane', millerPlane);

                const model = viewer.getModel();
                const atoms = model.selectedAtoms({index: Array.from(atomsSelectionSet)});
                console.log(atoms);

                alignToMillerPlane(viewer, ...atoms, millerPlane);

                viewer.removeShape(alignmentPlaneVec);
                viewer.setStyle({}, defaultViewerStyle);
                viewer.zoomTo({model}, 250);
                viewer.render();

                alignmentPlaneVec = drawTriangle(viewer, ...atoms);
                viewer.setStyle({index: Array.from(atomsSelectionSet)}, {...defaultViewerStyle, ...selectedAtomStyle});
                viewer.render();

                renderSelectedAtomDetails(viewer);
            }
        });
    });

    // Attach event listener to clear selection button
    document.getElementById('clear-selection-button').addEventListener('click', () => {
        clearAtomsSelection(viewer);
    });

});

// function to render selected atoms details, dealing with global doubleSelectionSet
// should update two divs in html ID'd with atom1-info and atom2-info
// display basic atom details like element, x, y, z
function renderSelectedAtomDetails(viewer) {
    let atomsIter = atomsSelectionSet.keys();
    let atom1 = atomsSelectionSet.size > 0 ? viewer.models[0].atoms[atomsIter.next().value] : { elem: 'N/A', x: 'N/A', y: 'N/A', z: 'N/A' };
    let atom2 = atomsSelectionSet.size > 1 ? viewer.models[0].atoms[atomsIter.next().value] : { elem: 'N/A', x: 'N/A', y: 'N/A', z: 'N/A' };
    let atom3 = atomsSelectionSet.size > 2 ? viewer.models[0].atoms[atomsIter.next().value] : { elem: 'N/A', x: 'N/A', y: 'N/A', z: 'N/A' };
    document.getElementById('atom1-info').innerText = `Atom 1: ${atom1.elem} (${atom1.x}, ${atom1.y}, ${atom1.z})`;
    document.getElementById('atom2-info').innerText = `Atom 2: ${atom2.elem} (${atom2.x}, ${atom2.y}, ${atom2.z})`;
    document.getElementById('atom3-info').innerText = `Atom 3: ${atom3.elem} (${atom3.x}, ${atom3.y}, ${atom3.z})`;
}

function debugVectorAngles(point1, point2) {
    // Create vector from points
    const vec1 = new $3Dmol.Vector3(point1.x, point1.y, point1.z);
    const vec2 = new $3Dmol.Vector3(point2.x, point2.y, point2.z);
    const direction = new $3Dmol.Vector3().subVectors(vec2, vec1);
    direction.normalize();

    // Unit vectors for each axis
    const xAxis = new $3Dmol.Vector3(1, 0, 0);
    const yAxis = new $3Dmol.Vector3(0, 1, 0);
    const zAxis = new $3Dmol.Vector3(0, 0, 1);

    // Calculate angles in degrees
    const angleX = Math.acos(direction.dot(xAxis)) * (180/Math.PI);
    const angleY = Math.acos(direction.dot(yAxis)) * (180/Math.PI);
    const angleZ = Math.acos(direction.dot(zAxis)) * (180/Math.PI);

    console.log('Vector direction:', {
        x: direction.x.toFixed(3),
        y: direction.y.toFixed(3),
        z: direction.z.toFixed(3)
    });
    
    console.log('Angles with axes:',
        '\nX-axis:', angleX.toFixed(2) + '°',
        '\nY-axis:', angleY.toFixed(2) + '°',
        '\nZ-axis:', angleZ.toFixed(2) + '°'
    );
}

function calculateAlignmentRotation(point1, point2, targetAxis = '(100)') {
    // Create and normalize the direction vector
    const vec1 = new $3Dmol.Vector3(point1.x, point1.y, point1.z);
    const vec2 = new $3Dmol.Vector3(point2.x, point2.y, point2.z);
    const direction = new $3Dmol.Vector3().subVectors(vec2, vec1).normalize();

    // Parse Miller indices and create target vector
    const [h, k, l] = parseMillerNotation(targetAxis);
    const targetVec = new $3Dmol.Vector3(h, k, l).normalize();

    // Calculate the rotation axis and angle
    const rotAxis = new $3Dmol.Vector3().crossVectors(direction, targetVec);

    // If the vectors are parallel, no rotation is needed. Essentially very small angle.
    if (rotAxis.length() < 10e-12) {
        console.log('The vectors are already aligned. No rotation needed.');
        return new $3Dmol.Matrix4().identity();
    }

    rotAxis.normalize();
    const angle = Math.acos(Math.min(Math.max(direction.dot(targetVec), -1), 1));

    // Create the rotation matrix using Rodrigues' formula
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    const oneMinusCos = 1 - cosAngle;

    const { x, y, z } = rotAxis;

    // Rotation matrix elements
    const rotMatrix = new $3Dmol.Matrix4().set(
        cosAngle + x * x * oneMinusCos, x * y * oneMinusCos - z * sinAngle, x * z * oneMinusCos + y * sinAngle, 0,
        y * x * oneMinusCos + z * sinAngle, cosAngle + y * y * oneMinusCos, y * z * oneMinusCos - x * sinAngle, 0,
        z * x * oneMinusCos - y * sinAngle, z * y * oneMinusCos + x * sinAngle, cosAngle + z * z * oneMinusCos, 0,
        0, 0, 0, 1
    );

    // Suppose rotMatrix is your rotation matrix (already computed).
    // We want to check R^T * R to verify orthonormality.

    // 1) Clone the original matrix into a new Matrix4, so we don't mutate the original
    const Rclone = new $3Dmol.Matrix4();
    Rclone.copy(rotMatrix);

    // 2) Transpose in place; now Rclone == R^T
    Rclone.transpose();

    // 3) Multiply (R^T) by the original R
    const RTR = new $3Dmol.Matrix4();                          // another fresh matrix
    RTR.multiplyMatrices(Rclone, rotMatrix);            // RTR = R^T * R

    // 4) Now log the elements. For a perfect rotation, R^T * R ≈ Identity.
    console.log("R^T * R (should be close to identity):", RTR.elements);

    // 5) (Optional) Check the 3×3 sub-determinant to confirm det(R) ≈ +1.
    const rotMat3 = rotMatrix.matrix3FromTopLeft();     // top-left 3×3
    const det3 = rotMat3.getDeterminant();
    console.log("det(R) (3×3) ~", det3);                // Should be near +1


    return rotMatrix;
}

function applyRotationToModel(viewer, rotationMatrix) {
    const model = viewer.getModel();
    const elements = rotationMatrix.elements;
    const originalPositions = [];
    const newPositions = [];

    // Store original positions and calculate new positions
    model.selectedAtoms({}).forEach(atom => {
        const { x, y, z } = atom;
        originalPositions.push({ x, y, z });

        const newX = elements[0] * x + elements[4] * y + elements[8] * z + elements[12];
        const newY = elements[1] * x + elements[5] * y + elements[9] * z + elements[13];
        const newZ = elements[2] * x + elements[6] * y + elements[10] * z + elements[14];
        newPositions.push({ x: newX, y: newY, z: newZ });
    });

    // Calculate RMSD
    const rmsd = calculateRMSD(originalPositions, newPositions);
    console.log(`RMSD: ${rmsd} Å`);

    newPositions.forEach((pos, i) => {
        const atom = model.selectedAtoms({})[i];
        atom.x = pos.x;
        atom.y = pos.y;
        atom.z = pos.z;
    });

}

function calculateRMSD(positions1, positions2) {
    if (positions1.length !== positions2.length) {
        throw new Error('Position arrays must have equal length');
    }

    const sumSquaredDiff = positions1.reduce((sum, pos1, i) => {
        const pos2 = positions2[i];
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return sum + dx*dx + dy*dy + dz*dz;
    }, 0);

    return Math.sqrt(sumSquaredDiff / positions1.length);
}

function alignToMillerPlane(viewer, atom1, atom2, atom3, millerNotation) {
    // Parse Miller notation string and convert to normal vector
    const indices = parseMillerNotation(millerNotation);
    const normal = millerIndicesToNormal(indices);
    
    // Calculate the current plane normal from three atoms
    const planeNormal = calculatePlaneNormal(atom1, atom2, atom3);
    
    // Calculate rotation matrix to align plane normals
    const rotationMatrix = calculateNormalAlignment(planeNormal, normal);
    
    // Get the current view
    const currentView = viewer.getView();

    // Apply the rotation
    applyRotationToModel(viewer, rotationMatrix);

    // Update the view
    viewer.setView(currentView);
}

function parseMillerNotation(...notation) {
    if (typeof notation[0] === 'string') {
        const matches = notation[0].match(/-?\d/g);
        if (!matches || matches.length !== 3) {
            throw new Error('Invalid Miller index format. Expected three components like "(100)" or "[0-10]".');
        }
        return matches.map(Number);
    } else {
        if (notation.length !== 3) {
            throw new Error('Provide three numbers (e.g., 1, 0, -1) or a single string (e.g., "[0-10]").');
        }
        return notation.map(arg => parseInt(arg, 10));
    }
}

function millerIndicesToNormal([h, k, l]) {
    // For a cubic system, the normal vector is directly proportional to the Miller indices
    // but we need to consider the reciprocal lattice
    // The direction cosines are proportional to the Miller indices
    const d = Math.sqrt(h*h + k*k + l*l);
    
    // For (211): [2/√6, 1/√6, 1/√6]
    return new $3Dmol.Vector3(
        h / d,
        k / d,
        l / d
    );
}

// For non-cubic systems, we need the reciprocal lattice parameters
function millerIndicesToNormalGeneral([h, k, l], crystalSystem = 'cubic', latticeParams = {a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90}) {
    if (crystalSystem.toLowerCase() === 'cubic') {
        return millerIndicesToNormal([h, k, l]);
    }
    
    // Convert angles to radians
    const toRad = angle => angle * Math.PI / 180;
    const alpha = toRad(latticeParams.alpha);
    const beta = toRad(latticeParams.beta);
    const gamma = toRad(latticeParams.gamma);
    
    // Calculate reciprocal lattice parameters
    const volume = Math.sqrt(
        1 - Math.cos(alpha)**2 - Math.cos(beta)**2 - Math.cos(gamma)**2 
        + 2 * Math.cos(alpha) * Math.cos(beta) * Math.cos(gamma)
    );
    
    // Calculate metric tensor components for the reciprocal lattice
    // This gives the correct normal vector for any crystal system
    const a = latticeParams.a;
    const b = latticeParams.b;
    const c = latticeParams.c;
    
    const astar = b * c * Math.sin(alpha) / volume;
    const bstar = a * c * Math.sin(beta) / volume;
    const cstar = a * b * Math.sin(gamma) / volume;
    
    const x = h * astar;
    const y = k * bstar;
    const z = l * cstar;
    
    const d = Math.sqrt(x*x + y*y + z*z);
    
    return new $3Dmol.Vector3(x/d, y/d, z/d);
}

function calculatePlaneNormal(p1, p2, p3) {
    // Convert atoms to vectors
    const v1 = new $3Dmol.Vector3(p1.x, p1.y, p1.z);
    const v2 = new $3Dmol.Vector3(p2.x, p2.y, p2.z);
    const v3 = new $3Dmol.Vector3(p3.x, p3.y, p3.z);
    
    // Calculate vectors in the plane
    const vec1 = new $3Dmol.Vector3().subVectors(v2, v1);
    const vec2 = new $3Dmol.Vector3().subVectors(v3, v1);
    
    // Calculate normal using cross product
    return new $3Dmol.Vector3()
        .crossVectors(vec1, vec2)
        .normalize();
}

function calculateNormalAlignment(currentNormal, targetNormal) {
    // Calculate rotation axis and angle
    const rotAxis = new $3Dmol.Vector3()
        .crossVectors(currentNormal, targetNormal)
        .normalize();
        
    // If normals are parallel (either same or opposite direction)
    if (rotAxis.length() < 1e-10) {
        const dot = currentNormal.dot(targetNormal);
        if (dot > 0) {
            // Same direction - no rotation needed
            return new $3Dmol.Matrix4().identity();
        } else {
            // Opposite direction - rotate 180° around any perpendicular axis
            const perpAxis = findPerpendicularVector(currentNormal);
            return createRotationMatrix(perpAxis, Math.PI);
        }
    }
    
    const angle = Math.acos(
        Math.min(Math.max(currentNormal.dot(targetNormal), -1), 1)
    );
    
    return createRotationMatrix(rotAxis, angle);
}

function findPerpendicularVector(v) {
    // Find any vector perpendicular to v
    const temp = Math.abs(v.x) < 0.5 ? 
        new $3Dmol.Vector3(1, 0, 0) : 
        new $3Dmol.Vector3(0, 1, 0);
        
    return new $3Dmol.Vector3()
        .crossVectors(v, temp)
        .normalize();
}

function createRotationMatrix(axis, angle) {
    const { x, y, z } = axis;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    
    return new $3Dmol.Matrix4().set(
        t*x*x + c,    t*x*y - z*s,  t*x*z + y*s,  0,
        t*x*y + z*s,  t*y*y + c,    t*y*z - x*s,  0,
        t*x*z - y*s,  t*y*z + x*s,  t*z*z + c,    0,
        0,            0,            0,            1
    );
}

function translateModelTo(viewer, atom, target) {
    const model = viewer.getModel();

    // Calculate the translation vector
    const translationVector = new $3Dmol.Vector3(
        target.x - atom.x,
        target.y - atom.y,
        target.z - atom.z
    );

    console.log('Translation vector:', translationVector);

    // Iterate through each atom in the model and apply the translation
    model.selectedAtoms({}).forEach(atom => {
        // Update the atom's position
        atom.x += translationVector.x;
        atom.y += translationVector.y;
        atom.z += translationVector.z;
    });
}

// Mock data
const mockXYZdata = `115
Energy=-16825.788078529
Si          2.415346       3.208028       0.972056
Si         -0.260709       6.010750       0.931038
Si          2.591406       5.953935      -1.735342
Si         -1.829251       4.631159       4.981840
Si          1.023952       4.575182       2.315045
Si         -0.442282       3.265651       3.633280
Si         -0.479638       5.988326       6.387412
Si          2.367861       5.943840       3.714218
Si          1.194195       7.324236      -0.397449
Si          2.542519       8.681480       1.006293
Si         -1.654465       7.381958       2.269105
Si         -1.670594      10.118181       5.040790
Si          1.203991      10.032200       2.408480
Si          0.997769       7.319098       5.084224
Si          2.350384       8.678722       6.487001
Si         -0.307555       8.734823       3.677978
Si         -0.294691      11.447008       6.439549
Si          2.525036      11.423761       3.787490
Si         -1.845766       7.368378       7.753948
Si          0.990133      10.052546       7.865052
Si         -0.474748       8.706107       9.146549
Si          2.364535      11.384498       9.260367
Si          1.160881      12.802107       5.154872
Si          2.541625      14.128981       6.552676
Si          3.876199       4.516808      -0.351944
Si          6.709235       4.472358      -3.015529
Si          5.260992       3.146582      -1.699878
Si          5.221989       5.880272       1.050195
Si          8.051177       5.786780      -1.581250
Si          4.040024       7.266698      -3.072728
Si          4.017976      10.008515      -0.293268
Si          6.698214       7.205098      -0.251996
Si          8.024704       8.528945       1.192931
Si          5.369948       8.600822      -1.637495
Si          5.350710      11.345580       1.137810
Si          3.849397       7.265479       2.411577
Si          3.832200      10.008300       5.192985
Si          6.677344       9.949531       2.523564
Si          5.193095       8.627743       3.819527
Si          5.187434      11.358206       6.606273
Si          8.007566      11.266583       3.972393
Si          4.000910      12.749299       2.487020
Si          3.990794      15.491455       5.267428
Si          6.664349      12.685645       5.307910
Si          7.999815      14.001734       6.754742
Si          5.336579      14.081288       3.921924
Si          5.352251      16.812435       6.680399
Si          3.825919      12.734686       7.979906
Si          6.642103      15.411941       8.079414
Si          5.194365      14.070121       9.378576
H           1.571312       2.356034       0.083429
H          -1.114471       5.173736       0.031874
H           1.735110       5.113002      -2.628161
Si         -3.111383       6.070168       3.597716
H          -1.290337       2.425195       2.737474
Si         -3.314447       6.027891       9.039951
H           0.391743       8.216957      -1.288519
H          -1.161550      12.327056       7.283564
H          -1.334088       9.581732       9.996888
H           1.508468      12.254313      10.119929
H           0.358938      13.701607       4.270174
H           1.673255      15.003873       7.400359
H           4.408910       2.295597      -2.581501
H           3.229417       8.162530      -3.953247
Si          5.425931       5.888658      -4.404935
H           3.211878      10.899485      -1.182943
H           6.284166       9.450362      -2.461254
H           6.262034      12.193852       0.308911
H           3.194895      13.648113       1.605324
H           3.180312      16.380769       4.380232
H           6.251514      14.923638       3.091586
H           4.330918      14.932690      10.237744
H          -2.455924       8.278296       1.380634
Si         -3.127878       8.763426       6.325049
H          -2.472017      11.013571       4.151282
H          -3.988414       9.647279       7.171335
Si         -4.511538       7.438411       4.931359
H          -3.959817       5.231288       2.695652
H          -5.304998       8.336906       4.038614
Si         -5.959107       6.101080       6.236869
Si         -3.300011       3.317323       6.292576
Si         -4.672970       4.696508       7.635300
H          -4.173293       6.912219       9.881426
H          -6.829637       5.283646       5.342255
H          -6.852451       6.971620       7.055463
H          -5.584880       3.849557       8.464020
H          -4.148491       2.488415       5.386827
H           4.500865      17.716460       7.507483
H           6.252123      17.673718       5.859088
H           7.500315      16.241275       8.980513
H           7.579209       3.589259      -3.852343
H           6.332813       6.737849      -5.231609
H           4.595810       5.077651      -5.341805
H           3.203322       2.290669       1.845120
H           0.339376       2.337634       4.500340
H           0.324557       5.093150       7.275347
H           3.178703       5.058391       4.605777
H           3.160446       7.779084       7.365001
H           0.307645       7.829006      10.064639
H           3.150732      10.501804      10.170137
H           6.050494       2.229950      -0.827612
H           6.031371       4.990969       1.939671
H           9.013154       6.605372      -2.373777
H           8.852778       4.900024      -0.688296
H           8.989284       9.342685       0.398152
H           8.825306       7.636941       2.081736
H           5.994367       7.731197       4.708361
H           5.995596      10.460633       7.488251
H           8.974208      12.080043       3.180001
H           8.805722      10.368379       4.857104
H           8.965606      14.811125       5.957855
H           8.796900      13.099383       7.636005
H           5.981991      13.187513      10.286983
H          -2.532659       5.157532       9.964580
H          -2.520625       2.380494       7.151649
`;
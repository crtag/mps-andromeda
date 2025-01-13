let cadFrameEl = document.getElementById('cad-frame');
let defaultViewerStyle = {stick:{}, sphere:{radius: 0.5}, clicksphere:{radius: 0.5}};
let selectedAtomStyle = {sphere: {color: '#FF69B4', radius: 0.75 }};
const doubleSelectionSet = new Set();
let alignmentLineVec = null;

function initCad() {
    let config = { backgroundColor: '#EEEEEE' };
    let viewer = $3Dmol.createViewer( cadFrameEl, config );
    return viewer;
}

function renderXYZdata(viewer, data) {
    let model = viewer.addModel(data, "xyz");
    handleAtomSelection(viewer);

    viewer.zoomTo();
    viewer.setStyle({}, defaultViewerStyle);
    viewer.render();
}

function handleAtomSelection(viewer) {
    viewer.setClickable({}, true, (atom) => {
        console.log(atom);
        
        if (doubleSelectionSet.has(atom.index)) {
            doubleSelectionSet.delete(atom.index);
            viewer.setStyle({index: atom.index}, defaultViewerStyle);
        } else if (doubleSelectionSet.size < 2) {
            doubleSelectionSet.add(atom.index);
            viewer.setStyle({index: atom.index}, {...defaultViewerStyle, ...selectedAtomStyle});
        }


        if (doubleSelectionSet.size === 2 && !alignmentLineVec) {
            let atomsIter = doubleSelectionSet.keys();
            alignmentLineVec = drawLine(viewer, viewer.models[0].atoms[atomsIter.next().value], viewer.models[0].atoms[atomsIter.next().value]);
        } 
        if (doubleSelectionSet.size < 2 && alignmentLineVec) {
                viewer.removeShape(alignmentLineVec);
                alignmentLineVec = null;
        }
        
        viewer.render();
    });
}

function drawLine(viewer, atom1, atom2) {
    return viewer.addArrow(
        {
            start: {x: atom1.x, y: atom1.y, z: atom1.z},
            end: { x: atom2.x, y: atom2.y, z: atom2.z},
            color: "#40E0D0",
            radiusRatio: 3, 
            midpos: -2.00,
        }
    );
}

// document onload event handler
document.addEventListener('DOMContentLoaded', () => {
    let viewer = initCad();
    renderXYZdata(viewer, mockXYZdata);
});

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
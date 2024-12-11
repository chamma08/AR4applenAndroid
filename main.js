// main.js
import * as THREE from "../../libs/three125/three.module.js";
import { GLTFLoader } from "../../libs/three/jsm/GLTFLoader.js";
import { RGBELoader } from "../../libs/three/jsm/RGBELoader.js";
import { OrbitControls } from "../../libs/three/jsm/OrbitControls.js";
import { ARButton } from "../../libs/ARButton.js";
import { LoadingBar } from "../../libs/LoadingBar.js";

class App {
  constructor() {
    const container = document.createElement("div");
    document.body.appendChild(container);

    this.loadingBar = new LoadingBar();
    this.loadingBar.visible = false;

    this.assetsPath = "../../assets/models/";

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );
    this.camera.position.set(0, 1.6, 0);

    this.scene = new THREE.Scene();

    const ambient = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    ambient.position.set(0.5, 1, 0.25);
    this.scene.add(ambient);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();

    this.setEnvironment();

    this.reticle = new THREE.Mesh(
      new THREE.RingBufferGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial()
    );

    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.minPolarAngle = Math.PI / 4;
    this.controls.maxPolarAngle = Math.PI / 2;

    this.setupXR();

    window.addEventListener("resize", this.resize.bind(this));
  }

  setupXR() {
    this.renderer.xr.enabled = true;

    if ("xr" in navigator) {
      navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
        if (supported) {
          ARButton.createButton(this.renderer);
        }
      });
    }

    const self = this;

    this.hitTestSourceRequested = false;
    this.hitTestSource = null;

    function onSelect() {
      if (self.chair === undefined) return;

      if (self.reticle.visible) {
        self.chair.position.setFromMatrixPosition(self.reticle.matrix);
        self.chair.visible = true;
      }
    }

    this.controller = this.renderer.xr.getController(0);
    this.controller.addEventListener("select", onSelect);

    this.scene.add(this.controller);

    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIOS) {
      console.log("iOS detected. Adding AR Quick Look fallback.");
      this.enableARQuickLook();
    }
  }

  enableARQuickLook() {
    const quickLookButton = document.createElement("a");
    quickLookButton.rel = "ar";
    quickLookButton.className = "ar-quicklook-button";
    quickLookButton.style.display = "none";
    document.body.appendChild(quickLookButton);

    this.showChair = function (id) {
      quickLookButton.href = `../../assets/models/ELE${id}.usdz`;
      quickLookButton.click();
    };
  }

  showChair(id) {
    this.initAR();

    const loader = new GLTFLoader().setPath(this.assetsPath);
    const self = this;

    this.loadingBar.visible = true;

    const scaleConfig = {
      1: { x: 5, y: 5, z: 5 },
      2: { x: 0.01, y: 0.01, z: 0.01 },
      3: { x: 0.06, y: 0.06, z: 0.06 },
      4: { x: 0.03, y: 0.03, z: 0.03 },
      5: { x: 0.3, y: 0.3, z: 0.3 },
    };

    loader.load(
      `ELE${id}.glb`,
      function (gltf) {
        self.scene.add(gltf.scene);
        self.chair = gltf.scene;

        const scale = scaleConfig[id] || { x: 1, y: 1, z: 1 };
        self.chair.scale.set(scale.x, scale.y, scale.z);

        self.chair.visible = false;
        self.loadingBar.visible = false;

        self.renderer.setAnimationLoop(self.render.bind(self));
      },
      function (xhr) {
        self.loadingBar.progress = xhr.loaded / xhr.total;
      },
      function (error) {
        console.log("An error happened while loading the model:", error);
      }
    );
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setEnvironment() {
    const loader = new RGBELoader().setDataType(THREE.UnsignedByteType);
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    const self = this;

    loader.load(
      "../../assets/hdr/venice_sunset_1k.hdr",
      (texture) => {
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        pmremGenerator.dispose();
        self.scene.environment = envMap;
      },
      undefined,
      (err) => {
        console.error("An error occurred setting the environment");
      }
    );
  }

  render(timestamp, frame) {
    if (frame) {
      if (this.hitTestSourceRequested === false) this.requestHitTestSource();
      if (this.hitTestSource) this.getHitTestResults(frame);
    }

    this.renderer.render(this.scene, this.camera);
    this.controls.update();
  }
}

export { App };
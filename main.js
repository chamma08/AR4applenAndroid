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

    this.renderer.domElement.addEventListener(
      "touchstart",
      this.onTouchStart.bind(this),
      false
    );
    this.renderer.domElement.addEventListener(
      "touchend",
      this.onTouchEnd.bind(this),
      false
    );
  }

  setupXR() {
    this.renderer.xr.enabled = true;

    if ("xr" in navigator) {
      navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
        if (supported) {
          const collection = document.getElementsByClassName("ar-button");
          [...collection].forEach((el) => {
            el.style.display = "block";
          });
        }
      });

      const description = document.getElementById("ar-description");
      if (description) {
        description.style.display = "block";
      }
    }

    const self = this;

    this.hitTestSourceRequested = false;
    this.hitTestSource = null;

    function onSelect() {
      if (self.chair === undefined) return;

      if (self.reticle.visible) {
        self.chair.position.setFromMatrixPosition(self.reticle.matrix);
        self.chair.visible = true;

        const soundMap = {
          1: "esound.mp3",
          2: "b.mp3",
          3: "b.mp3",
          4: "b.mp3",
        };

        const audioFile = soundMap[self.currentModelId];

        if (audioFile) {
          console.log(`Playing sound for model ${self.currentModelId}: ${audioFile}`);

          if (!self.audio || self.audioFile !== audioFile) {
            if (self.audio) {
              self.audio.stop();
              self.camera.remove(self.audio.listener);
            }

            const listener = new THREE.AudioListener();
            self.camera.add(listener);

            self.audio = new THREE.Audio(listener);
            const audioLoader = new THREE.AudioLoader();

            audioLoader.load(
              `./assets/audio/${audioFile}`,
              function (buffer) {
                self.audio.setBuffer(buffer);
                self.audio.setLoop(true);
                self.audio.setVolume(1.0);
                self.audio.play();
              },
              undefined,
              function (error) {
                console.error(`Error loading audio file ${audioFile}:`, error);
              }
            );

            self.audioFile = audioFile;
          } else {
            if (self.audio.isPlaying) {
              self.audio.stop();
            }
            self.audio.play();
          }
        } else {
          console.log(`No sound assigned for model ID: ${self.currentModelId}`);
        }
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

  showChair(id) {
    this.initAR();

    const loader = new GLTFLoader().setPath(this.assetsPath);
    const self = this;

    this.loadingBar.visible = true;

    const scaleConfig = {
      1: { x: 5, y: 5, z: 5 }, // Scale for ELE1.glb
      2: { x: 0.01, y: 0.01, z: 0.01 }, // Scale for ELE2.glb
      3: { x: 0.06, y: 0.06, z: 0.06 }, // Scale for ELE3.glb
      4: { x: 0.03, y: 0.03, z: 0.03 },
      5: { x: 0.3, y: 0.3, z: 0.3 },
    };

    loader.load(
      `ELE${id}.glb`,
      function (gltf) {
        self.scene.add(gltf.scene);
        self.chair = gltf.scene;

        const scale = scaleConfig[id] || { x: 1, y: 1, z: 1 }; // Default scale if not in config
        self.chair.scale.set(scale.x, scale.y, scale.z);

        self.chair.visible = false;

        self.currentModelId = id;

        if (gltf.animations && gltf.animations.length > 0) {
          self.mixer = new THREE.AnimationMixer(gltf.scene);
          gltf.animations.forEach((clip) => {
            self.mixer.clipAction(clip).play();
          });
        }

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

  onTouchStart(event) {
    this.controls.enabled = true;
  }

  onTouchEnd(event) {
    this.controls.enabled = false;
  }

  render(timestamp, frame) {
    if (frame) {
      if (this.hitTestSourceRequested === false) this.requestHitTestSource();

      if (this.hitTestSource) this.getHitTestResults(frame);
    }

    if (this.mixer) {
      this.mixer.update(this.clock.getDelta());
    }

    this.renderer.render(this.scene, this.camera);
    this.controls.update();
  }
}

export { App };

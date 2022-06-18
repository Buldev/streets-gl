import System from "../System";
import SystemManager from "../SystemManager";
import ControlsSystem from "./ControlsSystem";
import MathUtils from "../../math/MathUtils";
import Vec3 from "../../math/Vec3";
import Config from "../Config";
import SunCalc from 'suncalc';
import Easing from "../../math/Easing";

const PredefinedLightStates: [Vec3, Vec3][] = [
	[new Vec3(-1, -1, -1).normalize(), new Vec3(0, 1, 0).normalize()],
	[new Vec3(-1, -3, -1).normalize(), new Vec3(0, 1, 0).normalize()],
	[new Vec3(1, -0.4, 1).normalize(), new Vec3(0, 1, 0).normalize()],
	[new Vec3(0, 1, 0).normalize(), new Vec3(-1, -1, -1).normalize()]
];

export default class MapTimeSystem extends System {
	private stateId = -1;
	public lightDirection: Vec3 = new Vec3();
	public lightIntensity = 0;
	public ambientIntensity = 0;

	private sunDirection: Vec3 = null;
	private moonDirection: Vec3 = null;

	private transitionProgress = 1;
	private sunTransitionStart: Vec3 = null;
	private moonTransitionStart: Vec3 = null;

	public constructor(systemManager: SystemManager) {
		super(systemManager);

		document.addEventListener('keydown', (event) => {
			const code = event.code;

			if (code.startsWith('Digit')) {
				const digit = parseInt(code[5]);

				if (digit < 1 || digit > PredefinedLightStates.length + 1) {
					return;
				}

				this.setState(digit - 2);
			}
		});
	}

	public postInit(): void {

	}

	public setState(state: number): void {
		this.stateId = state;
		this.transitionProgress = 0;
		this.sunTransitionStart = Vec3.clone(this.sunDirection);
		this.moonTransitionStart = Vec3.clone(this.moonDirection);
	}

	private getSunDirection(): Vec3 {
		if (this.stateId !== -1) {
			return PredefinedLightStates[this.stateId][0];
		}

		const latLon = this.systemManager.getSystem(ControlsSystem).getLatLon();
		const sunPosition = SunCalc.getPosition(new Date(Date.now()), latLon.lat, latLon.lon);

		return MathUtils.sphericalToCartesian(sunPosition.azimuth + Math.PI, sunPosition.altitude);
	}

	private getMoonDirection(): Vec3 {
		if (this.stateId !== -1) {
			return PredefinedLightStates[this.stateId][1];
		}

		const latLon = this.systemManager.getSystem(ControlsSystem).getLatLon();
		const moonPosition = SunCalc.getMoonPosition(new Date(Date.now()), latLon.lat, latLon.lon);

		return MathUtils.sphericalToCartesian(moonPosition.azimuth + Math.PI, moonPosition.altitude);
	}

	private doTransition(targetSunDirection: Vec3, targetMoonDirection: Vec3, deltaTime: number): void {
		if (this.sunDirection === null || this.sunTransitionStart === null) {
			this.sunDirection = targetSunDirection;
		} else {
			this.sunDirection = Vec3.nlerp(
				this.sunTransitionStart,
				targetSunDirection,
				this.getSmoothedTransitionProgress()
			);
		}

		if (this.moonDirection === null || this.moonTransitionStart === null) {
			this.moonDirection = targetMoonDirection;
		} else {
			this.moonDirection = Vec3.nlerp(
				this.moonTransitionStart,
				targetMoonDirection,
				this.getSmoothedTransitionProgress()
			);
		}

		this.transitionProgress += deltaTime / Config.LightTransitionDuration;
		this.transitionProgress = Math.min(1, this.transitionProgress);
	}

	private getSmoothedTransitionProgress(): number {
		return Easing.easeOutQuart(this.transitionProgress);
	}

	public update(deltaTime: number): void {
		const targetSunDirection = this.getSunDirection();
		const targetMoonDirection = this.getMoonDirection();

		this.doTransition(targetSunDirection, targetMoonDirection, deltaTime);

		if (this.sunDirection.y < 0) {
			this.lightIntensity = 3.5;
			this.ambientIntensity = 0.2;
			this.lightDirection = this.sunDirection;
		} else {
			this.ambientIntensity = 0.1;
			this.lightDirection = this.moonDirection;

			if (this.moonDirection.y < 0) {
				this.lightIntensity = 0.05;

			} else {
				this.lightIntensity = 0;
			}
		}
	}
}
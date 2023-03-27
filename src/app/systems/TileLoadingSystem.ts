import Tile from "../objects/Tile";
import System from "../System";
import MapWorkerSystem from "./MapWorkerSystem";
import Tile3DBuffers from "~/lib/tile-processing/tile3d/buffers/Tile3DBuffers";
import Config from "~/app/Config";

interface QueueItem {
	tile: Tile;
	onLoad: (...args: any[]) => any;
}

export interface OverpassEndpoint {
	url: string;
	isEnabled: boolean;
	isUserDefined: boolean;
}

export default class TileLoadingSystem extends System {
	private readonly queue: QueueItem[] = [];
	public readonly overpassEndpointsDefault: OverpassEndpoint[] = [];
	public overpassEndpoints: OverpassEndpoint[] = [];

	public constructor() {
		super();

		for (const {url, isEnabled} of Config.OverpassEndpoints) {
			const endpoint: OverpassEndpoint = {
				url: url,
				isEnabled: isEnabled,
				isUserDefined: false
			};

			this.overpassEndpoints.push(endpoint);
			this.overpassEndpointsDefault.push(endpoint);
		}
	}

	public postInit(): void {

	}

	public resetOverpassEndpoints(): void {
		this.overpassEndpoints = this.overpassEndpointsDefault;
	}

	private getNextOverpassEndpoint(): string {
		const urls = this.overpassEndpoints
			.filter(endpoint => endpoint.isEnabled)
			.map(endpoint => endpoint.url);

		if (urls.length === 0) {
			return null;
		}

		return urls[Math.floor(Math.random() * urls.length)];
	}

	public async getTileObjects(tile: Tile): Promise<Tile3DBuffers> {
		return new Promise<Tile3DBuffers>((resolve) => {
			this.queue.push({
				tile,
				onLoad: (data: Tile3DBuffers) => {
					resolve(data);
				}
			});
		});
	}

	public update(deltaTime: number): void {
		this.removeDisposedTiles();

		const mapWorkerSystem = this.systemManager.getSystem(MapWorkerSystem);

		while (this.queue.length > 0 && mapWorkerSystem.getFreeWorker() && this.getNextOverpassEndpoint()) {
			const worker = mapWorkerSystem.getFreeWorker();
			const endpoint = this.getNextOverpassEndpoint();
			const {tile, onLoad} = this.getNearestTileInQueue();

			worker.start(tile.x, tile.y, endpoint).then(result => {
				onLoad(result);
			}, error => {
				//console.error(error, `${tile.x}, ${tile.y}`);
				this.queue.unshift({tile, onLoad});
			});
		}
	}

	private removeDisposedTiles(): void {
		this.queue.filter((entry: QueueItem) => {
			return !entry.tile.disposed;
		});
	}

	private getNearestTileInQueue(): QueueItem {
		this.queue.sort((a: QueueItem, b: QueueItem): number => {
			return b.tile.distanceToCamera - a.tile.distanceToCamera;
		});

		return this.queue.pop();
	}
}
import { GetUrlFn, XhrRequest } from '../loading/types';
export declare function loadOctree(octreeUrl: string, hierarchyUrl: string, metadataUrl: GetUrlFn, xhrRequest: XhrRequest): Promise<import("./OctreeGeometry").OctreeGeometry>;

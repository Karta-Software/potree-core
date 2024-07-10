import {OctreeLoader} from './OctreeLoader';
import {GetUrlFn, XhrRequest} from '../loading/types';

export async function loadOctree(
	octreeUrl: string, 
	hierarchyUrl: string, 
	metadataUrl: GetUrlFn, 
	xhrRequest: XhrRequest,
) 
{
	const trueMetadataUrl = await metadataUrl("metadata.json");
	const loader = new OctreeLoader();
	const {geometry} = await loader.load(trueMetadataUrl, octreeUrl, hierarchyUrl, xhrRequest);
	return geometry;
}

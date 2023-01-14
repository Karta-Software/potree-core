

import {PointAttribute, PointAttributeTypes} from "./PointAttributes";

const typedArrayMapping = {
	"int8":   Int8Array,
	"int16":  Int16Array,
	"int32":  Int32Array,
	"int64":  Float64Array,
	"uint8":  Uint8Array,
	"uint16": Uint16Array,
	"uint32": Uint32Array,
	"uint64": Float64Array,
	"float":  Float32Array,
	"double": Float64Array,
};

// Potree = {};

onmessage = function (event) {

	let {buffer, pointAttributes, scale, name, min, max, size, offset, numPoints} = event.data;

	let tStart = performance.now();

	let view = new DataView(buffer);
	
	let attributeBuffers = {};
	let attributeOffset = 0;

	let bytesPerPoint = 0;
	for (let pointAttribute of pointAttributes.attributes) {
		bytesPerPoint += pointAttribute.byteSize;
	}

	let gridSize = 32;
	let grid = new Uint32Array(gridSize ** 3);
	let toIndex = (x, y, z) => {
		// let dx = gridSize * (x - min.x) / size.x;
		// let dy = gridSize * (y - min.y) / size.y;
		// let dz = gridSize * (z - min.z) / size.z;

		// min is already subtracted
		let dx = gridSize * x / size.x;
		let dy = gridSize * y / size.y;
		let dz = gridSize * z / size.z;

		let ix = Math.min(parseInt(dx), gridSize - 1);
		let iy = Math.min(parseInt(dy), gridSize - 1);
		let iz = Math.min(parseInt(dz), gridSize - 1);

		let index = ix + iy * gridSize + iz * gridSize * gridSize;

		return index;
	};

	let numOccupiedCells = 0;
	for (let pointAttribute of pointAttributes.attributes) {
		
		if(["POSITION_CARTESIAN", "position"].includes(pointAttribute.name)){
			let buff = new ArrayBuffer(numPoints * 4 * 3);
			let positions = new Float32Array(buff);
		
			for (let j = 0; j < numPoints; j++) {
				
				let pointOffset = j * bytesPerPoint;

				let x = (view.getInt32(pointOffset + attributeOffset + 0, true) * scale[0]) + offset[0] - min.x;
				let y = (view.getInt32(pointOffset + attributeOffset + 4, true) * scale[1]) + offset[1] - min.y;
				let z = (view.getInt32(pointOffset + attributeOffset + 8, true) * scale[2]) + offset[2] - min.z;

				let index = toIndex(x, y, z);
				let count = grid[index]++;
				if(count === 0){
					numOccupiedCells++;
				}

				positions[3 * j + 0] = x;
				positions[3 * j + 1] = y;
				positions[3 * j + 2] = z;
			}

			attributeBuffers[pointAttribute.name] = { buffer: buff, attribute: pointAttribute };
		}else if(["RGBA", "rgba"].includes(pointAttribute.name)){
			let buff = new ArrayBuffer(numPoints * 4);
			let colors = new Uint8Array(buff);

			for (let j = 0; j < numPoints; j++) {
				let pointOffset = j * bytesPerPoint;

				let r = view.getUint16(pointOffset + attributeOffset + 0, true);
				let g = view.getUint16(pointOffset + attributeOffset + 2, true);
				let b = view.getUint16(pointOffset + attributeOffset + 4, true);

				colors[4 * j + 0] = r > 255 ? r / 256 : r;
				colors[4 * j + 1] = g > 255 ? g / 256 : g;
				colors[4 * j + 2] = b > 255 ? b / 256 : b;
			}

			attributeBuffers[pointAttribute.name] = { buffer: buff, attribute: pointAttribute };
		}else{
			let buff = new ArrayBuffer(numPoints * 4);
			let f32 = new Float32Array(buff);

			let TypedArray = typedArrayMapping[pointAttribute.type.name];
			let preciseBuffer = new TypedArray(numPoints);

			let [offset, scale] = [0, 1];

			const getterMap = {
				"int8":   view.getInt8,
				"int16":  view.getInt16,
				"int32":  view.getInt32,
				// "int64":  view.getInt64,
				"uint8":  view.getUint8,
				"uint16": view.getUint16,
				"uint32": view.getUint32,
				// "uint64": view.getUint64,
				"float":  view.getFloat32,
				"double": view.getFloat64,
			};
			const getter = getterMap[pointAttribute.type.name].bind(view);

			// compute offset and scale to pack larger types into 32 bit floats
			if(pointAttribute.type.size > 4){
				let [amin, amax] = pointAttribute.range;
				offset = amin;
				scale = 1 / (amax - amin);
			}

			for(let j = 0; j < numPoints; j++){
				let pointOffset = j * bytesPerPoint;
				let value = getter(pointOffset + attributeOffset, true);

				f32[j] = (value - offset) * scale;
				preciseBuffer[j] = value;
			}

			attributeBuffers[pointAttribute.name] = { 
				buffer: buff,
				preciseBuffer: preciseBuffer,
				attribute: pointAttribute,
				offset: offset,
				scale: scale,
			};
		}

		attributeOffset += pointAttribute.byteSize;


	}

	let occupancy = parseInt(numPoints / numOccupiedCells);
	// console.log(`${name}: #points: ${numPoints}: #occupiedCells: ${numOccupiedCells}, occupancy: ${occupancy} points/cell`);

	{ // add indices
		let buff = new ArrayBuffer(numPoints * 4);
		let indices = new Uint32Array(buff);

		for (let i = 0; i < numPoints; i++) {
			indices[i] = i;
		}
		
		attributeBuffers["INDICES"] = { buffer: buff, attribute: PointAttribute.INDICES };
	}


	{ // handle attribute vectors
		let vectors = pointAttributes.vectors;

		for(let vector of vectors){

			let {name, attributes} = vector;
			let numVectorElements = attributes.length;
			let buffer = new ArrayBuffer(numVectorElements * numPoints * 4);
			let f32 = new Float32Array(buffer);

			let iElement = 0;
			for(let sourceName of attributes){
				let sourceBuffer = attributeBuffers[sourceName];
				let {offset, scale} = sourceBuffer;
				let view = new DataView(sourceBuffer.buffer);

				const getter = view.getFloat32.bind(view);

				for(let j = 0; j < numPoints; j++){
					let value = getter(j * 4, true);

					f32[j * numVectorElements + iElement] = (value / scale) + offset;
				}

				iElement++;
			}

			let vecAttribute = new PointAttribute(name, PointAttributeTypes.DATA_TYPE_FLOAT, 3);

			attributeBuffers[name] = { 
				buffer: buffer, 
				attribute: vecAttribute,
			};

		}

	}

	// let duration = performance.now() - tStart;
	// let pointsPerMs = numPoints / duration;
	// console.log(`duration: ${duration.toFixed(1)}ms, #points: ${numPoints}, points/ms: ${pointsPerMs.toFixed(1)}`);

	let message = {
		buffer: buffer,
		attributeBuffers: attributeBuffers,
		density: occupancy,
	};

	let transferables = [];
	for (let property in message.attributeBuffers) {
		transferables.push(message.attributeBuffers[property].buffer);
	}
	transferables.push(buffer);
	// console.log("new", message)

	postMessage(message, transferables);
};

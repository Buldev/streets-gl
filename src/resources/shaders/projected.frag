#include <versionPrecision>
#include <gBufferOut>

in vec2 vUv;
in vec3 vPosition;
in vec3 vLocalPosition;
in vec3 vNormal;
flat in int vNormalFollowsGround;
in vec3 vColor;
in vec4 vClipPos;
in vec4 vClipPosPrev;
in vec3 vCenter;
in vec4 vNormalUV;
flat in int vTextureId;
in float vNormalMixFactor;

uniform PerMesh {
	mat4 modelViewMatrix;
	mat4 modelViewMatrixPrev;
	vec4 transformNormal0;
	vec4 transformNormal1;
	float terrainRingSize;
	vec4 terrainRingOffset;
	int terrainLevelId;
	float segmentCount;
	vec2 cameraPosition;
};

uniform PerMaterial {
	mat4 projectionMatrix;
	float time;
};

uniform sampler2DArray tMap;
uniform sampler2DArray tNormal;
uniform sampler2D tWaterNormal;

#include <packNormal>
#include <getMotionVector>
#include <sampleCatmullRom>
#include <getTBN>
#include <sampleWaterNormal>

vec3 sampleNormalMap() {
	vec2 size = vec2(textureSize(tNormal, 0));
	vec3 level0 = sampleCatmullRom(tNormal, vec3(vNormalUV.xy, 0), size).xyz;
	vec3 level1 = sampleCatmullRom(tNormal, vec3(vNormalUV.zw, 1), size).xyz;
	float factor = smoothstep(NORMAL_MIX_FROM, NORMAL_MIX_TO, vNormalMixFactor);

	return mix(level0, level1, factor);
}

float edgeFactor() {
	float widthFactor = 1.;
	vec3 d = fwidth(vCenter.xyz);
	vec3 a3 = smoothstep(vec3(0), d * widthFactor, vCenter.xyz);

	return min(min(a3.x, a3.y), a3.z);
}

vec3 getNormal(vec3 normalMapValue) {
	mat3 tbn = getTBN(vNormal, vPosition, vUv);
	vec3 mapValue = normalMapValue * 2. - 1.;
	vec3 normal = normalize(tbn * mapValue);

	normal *= float(gl_FrontFacing) * 2. - 1.;

	return normal;
}

// RNM
vec3 NormalBlend_RNM(vec3 n1, vec3 n2)
{
	// Unpack (see article on why it's not just n*2-1)
	n1 = n1*vec3( 2,  2, 2) + vec3(-1, -1,  0);
	n2 = n2*vec3(-2, -2, 2) + vec3( 1,  1, -1);

	// Blend
	return n1*dot(n1, n2)/n1.z - n2;
}

// RNM - Already unpacked
vec3 NormalBlend_UnpackedRNM(vec3 n1, vec3 n2)
{
	n1 += vec3(0, 0, 1);
	n2 *= vec3(-1, -1, 1);

	return n1*dot(n1, n2)/n1.z - n2;
}

void main() {
	if (edgeFactor() > 0.9) {
		//discard;
	}

	if (vTextureId == 0) {
		vec2 normalizedUV = vUv / 611.4962158203125;
		normalizedUV = vec2(normalizedUV.y, 1. - normalizedUV.x);
		vec3 waterNormal = sampleWaterNormal(normalizedUV, time, tWaterNormal);
		vec3 mvWaterNormal = vec3(modelViewMatrix * vec4( NormalBlend_UnpackedRNM(vec3(0, 0, 1), waterNormal), 0));

		outColor = vec4(0.15, 0.2, 0.25, 0.5);
		outNormal = packNormal(mvWaterNormal);
		outRoughnessMetalnessF0 = vec3(0.05, 0, 0.03);
		outMotion = getMotionVector(vClipPos, vClipPosPrev);
		outObjectId = 0u;

		return;
	}

	vec2 mapUV = vUv;

	int layer = (vTextureId - 1) * 3;
	vec4 color = texture(tMap, vec3(mapUV, layer));
	vec3 normalMapValue = texture(tMap, vec3(vec2(mapUV.x, 1. - mapUV.y), layer + 1)).xyz;
	vec3 mask = texture(tMap, vec3(mapUV, layer + 2)).rgb;

	if (color.a < 0.5) {
		discard;
	}

	vec3 heightMapNormal = sampleNormalMap();

	#if IS_EXTRUDED == 0
		vec3 detailNormal = normalMapValue * 2. - 1.;
		vec3 combined = NormalBlend_UnpackedRNM(heightMapNormal, detailNormal);
		vec3 kindaVNormal = vec3(modelViewMatrix * vec4(combined, 0));
	#else
		vec3 kindaVNormal = (vNormalFollowsGround == 1) ?
			vec3(modelViewMatrix * vec4(NormalBlend_UnpackedRNM(heightMapNormal, (normalMapValue * 2. - 1.).xyz), 0)) :
			getNormal(normalMapValue);
	#endif

	outColor = color;
	outNormal = packNormal(kindaVNormal);
	outRoughnessMetalnessF0 = vec3(mask.xy, 0.03);
	outMotion = getMotionVector(vClipPos, vClipPosPrev);
	outObjectId = 0u;
}
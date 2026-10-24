import * as THREE from 'three';

/**
 * Parallax-corrected ("box-projected") environment mapping.
 *
 * The room's reflection probe is a cube map captured from one point. Sampled
 * naively, reflections of the walls slide around as the viewer moves. Box
 * projection intersects each reflection ray with the room's bounding box and
 * looks up the probe in the direction of that hit point instead, so the
 * reflection of the window in the polished floor stays where the window is.
 *
 * Shared uniforms: one probe for the whole room.
 */
export const boxProjectionUniforms = {
	uBPMin: { value: new THREE.Vector3() },
	uBPMax: { value: new THREE.Vector3() },
	uBPPos: { value: new THREE.Vector3() },
	uBPEnabled: { value: 0 },
};

const VERT_DECL = /* glsl */`
varying vec3 vBPWorldPos;
`;
const VERT_BODY = /* glsl */`
	{
		vec4 bpw = vec4( transformed, 1.0 );
		#ifdef USE_INSTANCING
			bpw = instanceMatrix * bpw;
		#endif
		#ifdef USE_BATCHING
			bpw = batchingMatrix * bpw;
		#endif
		vBPWorldPos = ( modelMatrix * bpw ).xyz;
	}
`;

const FRAG_DECL = /* glsl */`
varying vec3 vBPWorldPos;
uniform vec3 uBPMin;
uniform vec3 uBPMax;
uniform vec3 uBPPos;
uniform float uBPEnabled;

vec3 bpParallax( vec3 dirW ) {
	if ( uBPEnabled < 0.5 ) return dirW;
	vec3 safeDir = dirW + vec3( equal( dirW, vec3( 0.0 ) ) ) * 1e-5;
	vec3 tMax = ( uBPMax - vBPWorldPos ) / safeDir;
	vec3 tMin = ( uBPMin - vBPWorldPos ) / safeDir;
	vec3 tFar = max( tMax, tMin );
	float t = min( min( tFar.x, tFar.y ), tFar.z );
	vec3 hit = vBPWorldPos + dirW * max( t, 0.0 );
	return normalize( hit - uBPPos );
}
`;

// Replacement for three's envmap_physical_pars_fragment radiance/irradiance
// lookups. Only the CUBE_UV branch matters here (the probe is PMREM'd).
const ENV_PARS = /* glsl */`
#ifdef USE_ENVMAP

	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			// Irradiance is box-projected at half strength: enough to make
			// surfaces near the bright window receive more fill light,
			// without the distortion of a full projection on a diffuse lobe.
			vec3 dir = normalize( mix( worldNormal, bpParallax( worldNormal ), 0.5 ) );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * dir, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}

	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			reflectVec = bpParallax( reflectVec );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}

	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif

#endif
`;

// The window skylight is a RectAreaLight, which cannot cast shadows. Where a
// surface has a baked AO map we use it to occlude that light too: the AO map
// measures how much of the hemisphere is open, which for the soft skylight is
// a good proxy for its visibility (dark under the desk, open near the glass).
const RECT_BEGIN = THREE.ShaderChunk.lights_fragment_begin.replace(
	'#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )',
	`vec3 bpRectDiffuse0 = reflectedLight.directDiffuse;
vec3 bpRectSpecular0 = reflectedLight.directSpecular;
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )`,
).replace(
	'#if defined( RE_IndirectDiffuse )',
	`vec3 bpRectDiffuse = reflectedLight.directDiffuse - bpRectDiffuse0;
vec3 bpRectSpecular = reflectedLight.directSpecular - bpRectSpecular0;
#if defined( RE_IndirectDiffuse )`,
);
const RECT_AO = /* glsl */`
#ifdef USE_AOMAP
	reflectedLight.directDiffuse -= bpRectDiffuse * ( 1.0 - ambientOcclusion );
	reflectedLight.directSpecular -= bpRectSpecular * ( 1.0 - ambientOcclusion );
#endif
`;
if (!RECT_BEGIN.includes('bpRectDiffuse0') || !RECT_BEGIN.includes('bpRectSpecular =')) {
	throw new Error('lights_fragment_begin layout changed; update the rect-area AO patch');
}

const patched = new WeakSet<THREE.Material>();

/** Patch a standard/physical material to use the room's box-projected probe. */
export function applyBoxProjection(mat: THREE.Material): void {
	if (patched.has(mat)) return;
	if (!(mat instanceof THREE.MeshStandardMaterial)) return;
	patched.add(mat);
	const prev = mat.onBeforeCompile;
	mat.onBeforeCompile = (shader, renderer) => {
		prev?.call(mat, shader, renderer);
		Object.assign(shader.uniforms, boxProjectionUniforms);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\n' + VERT_DECL)
			.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', '#include <common>\n' + FRAG_DECL)
			.replace('#include <envmap_physical_pars_fragment>', ENV_PARS)
			.replace('#include <lights_fragment_begin>', RECT_BEGIN)
			.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + RECT_AO);
	};
	const prevKey = mat.customProgramCacheKey.bind(mat);
	mat.customProgramCacheKey = () => prevKey() + '|bp2';
	mat.needsUpdate = true;
}

export function setProbeBox(min: THREE.Vector3, max: THREE.Vector3, probePos: THREE.Vector3): void {
	boxProjectionUniforms.uBPMin.value.copy(min);
	boxProjectionUniforms.uBPMax.value.copy(max);
	boxProjectionUniforms.uBPPos.value.copy(probePos);
	boxProjectionUniforms.uBPEnabled.value = 1;
}

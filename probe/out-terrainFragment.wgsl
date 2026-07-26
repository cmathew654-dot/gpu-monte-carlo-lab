// Three.js r185 - Node System

// global
diagnostic( off, derivative_uniformity );


// structs

struct OutputStruct {
	@location( 0 ) color: vec4<f32>
};
var<private> output : OutputStruct;

// uniforms
@binding( 1 ) @group( 1 ) var nodeUniform14_sampler : sampler;
@binding( 2 ) @group( 1 ) var nodeUniform14 : texture_2d<f32>;

struct objectStruct {
	nodeUniform0 : mat4x4<f32>,
	nodeUniform1 : f32,
	nodeUniform2 : f32,
	nodeUniform3 : f32,
	nodeUniform5 : mat3x3<f32>,
	nodeUniform7 : f32,
	nodeUniform8 : f32,
	nodeUniform9 : f32
};
@binding( 0 ) @group( 1 )
var<uniform> object : objectStruct;

struct renderStruct {
	cameraProjectionMatrix : mat4x4<f32>,
	cameraViewMatrix : mat4x4<f32>,
	nodeUniform10 : vec3<f32>,
	nodeUniform13 : vec3<f32>,
	nodeUniform11 : vec3<f32>,
	nodeUniform12 : vec3<f32>
};
@binding( 0 ) @group( 0 )
var<uniform> render : renderStruct;

// vars
var<private> DiffuseColor : vec4<f32>;
var<private> normalViewGeometry : vec3<f32>;
var<private> NORMAL_normalView : vec3<f32>;
var<private> normalView : vec3<f32>;
var<private> normalWorld : vec3<f32>;
var<private> nodeVar0 : f32;
var<private> nodeVar1 : f32;
var<private> Metalness : f32;
var<private> Roughness : f32;
var<private> nodeVar2 : vec3<f32>;
var<private> SpecularColor : vec3<f32>;
var<private> SpecularColorBlended : vec3<f32>;
var<private> SpecularF90 : f32;
var<private> DiffuseContribution : vec3<f32>;
var<private> EmissiveColor : vec3<f32>;
var<private> Output : vec4<f32>;
var<private> irradiance : vec3<f32>;
var<private> nodeVar3 : vec3<f32>;
var<private> nodeVar4 : vec3<f32>;
var<private> nodeVar5 : vec4<f32>;
var<private> nodeVar6 : vec4<f32>;
var<private> nodeVar7 : vec3<f32>;
var<private> nodeVar8 : vec3<f32>;
var<private> nodeVar9 : f32;
var<private> nodeVar10 : vec3<f32>;
var<private> nodeVar11 : vec3<f32>;
var<private> directDiffuse : vec3<f32>;
var<private> nodeVar12 : vec3<f32>;
var<private> nodeVar13 : vec3<f32>;
var<private> nodeVar14 : vec3<f32>;
var<private> directSpecular : vec3<f32>;
var<private> positionViewDirection : vec3<f32>;
var<private> nodeVar15 : vec3<f32>;
var<private> nodeVar16 : f32;
var<private> nodeVar17 : f32;
var<private> nodeVar18 : f32;
var<private> nodeVar19 : vec4<f32>;
var<private> nodeVar20 : vec4<f32>;
var<private> nodeVar21 : vec3<f32>;
var<private> nodeVar22 : f32;
var<private> nodeVar23 : f32;
var<private> nodeVar24 : vec3<f32>;
var<private> nodeVar25 : vec3<f32>;
var<private> nodeVar26 : vec3<f32>;
var<private> nodeVar27 : vec3<f32>;
var<private> nodeVar28 : vec3<f32>;
var<private> nodeVar29 : vec3<f32>;
var<private> indirectDiffuse : vec3<f32>;
var<private> nodeVar30 : vec3<f32>;
var<private> singleScatteringDielectric : vec3<f32>;
var<private> multiScatteringDielectric : vec3<f32>;
var<private> singleScatteringMetallic : vec3<f32>;
var<private> multiScatteringMetallic : vec3<f32>;
var<private> nodeVar31 : f32;
var<private> nodeVar32 : vec4<f32>;
var<private> nodeVar33 : vec3<f32>;
var<private> nodeVar34 : f32;
var<private> nodeVar35 : vec3<f32>;
var<private> nodeVar36 : vec3<f32>;
var<private> nodeVar37 : vec3<f32>;
var<private> nodeVar38 : vec3<f32>;
var<private> nodeVar39 : vec3<f32>;
var<private> nodeVar40 : vec3<f32>;
var<private> nodeVar41 : vec3<f32>;
var<private> nodeVar42 : f32;
var<private> nodeVar43 : f32;
var<private> nodeVar44 : f32;
var<private> nodeVar45 : vec3<f32>;
var<private> nodeVar46 : vec3<f32>;
var<private> nodeVar47 : vec3<f32>;
var<private> nodeVar48 : vec3<f32>;
var<private> nodeVar49 : vec3<f32>;
var<private> nodeVar50 : vec3<f32>;
var<private> nodeVar51 : f32;
var<private> nodeVar52 : vec4<f32>;
var<private> nodeVar53 : vec3<f32>;
var<private> nodeVar54 : f32;
var<private> nodeVar55 : vec3<f32>;
var<private> nodeVar56 : vec3<f32>;
var<private> nodeVar57 : vec3<f32>;
var<private> nodeVar58 : vec3<f32>;
var<private> nodeVar59 : vec3<f32>;
var<private> nodeVar60 : vec3<f32>;
var<private> nodeVar61 : vec3<f32>;
var<private> nodeVar62 : f32;
var<private> nodeVar63 : f32;
var<private> nodeVar64 : f32;
var<private> nodeVar65 : vec3<f32>;
var<private> nodeVar66 : vec3<f32>;
var<private> nodeVar67 : vec3<f32>;
var<private> nodeVar68 : vec3<f32>;
var<private> nodeVar69 : vec3<f32>;
var<private> nodeVar70 : vec3<f32>;
var<private> radiance : vec3<f32>;
var<private> nodeVar71 : vec3<f32>;
var<private> nodeVar72 : vec3<f32>;
var<private> nodeVar73 : vec3<f32>;
var<private> iblIrradiance : vec3<f32>;
var<private> nodeVar74 : vec3<f32>;
var<private> nodeVar75 : vec3<f32>;
var<private> nodeVar76 : vec3<f32>;
var<private> nodeVar77 : vec3<f32>;
var<private> nodeVar78 : vec3<f32>;
var<private> nodeVar79 : vec3<f32>;
var<private> nodeVar80 : vec3<f32>;
var<private> nodeVar81 : vec3<f32>;
var<private> nodeVar82 : vec3<f32>;
var<private> nodeVar83 : vec3<f32>;
var<private> indirectSpecular : vec3<f32>;
var<private> nodeVar84 : vec3<f32>;
var<private> nodeVar85 : vec3<f32>;
var<private> ambientOcclusion : f32;
var<private> nodeVar86 : vec3<f32>;
var<private> nodeVar87 : f32;
var<private> nodeVar88 : f32;
var<private> nodeVar89 : f32;
var<private> nodeVar90 : f32;
var<private> nodeVar91 : f32;
var<private> nodeVar92 : f32;
var<private> nodeVar93 : f32;
var<private> nodeVar94 : f32;
var<private> nodeVar95 : f32;
var<private> nodeVar96 : f32;
var<private> nodeVar97 : f32;
var<private> nodeVar98 : vec3<f32>;
var<private> totalDiffuse : vec3<f32>;
var<private> nodeVar99 : vec3<f32>;
var<private> totalSpecular : vec3<f32>;
var<private> nodeVar100 : vec3<f32>;
var<private> outgoingLight : vec3<f32>;
var<private> nodeVar101 : vec3<f32>;
var<private> nodeVar102 : vec4<f32>;

// codes
fn mx_rotl32 ( x : u32, k : i32 ) -> u32 {

	var nodeVar0 : i32;
	var nodeVar1 : u32;

	nodeVar0 = k;
	nodeVar1 = x;

	return ( ( nodeVar1 << u32( nodeVar0 ) ) | ( nodeVar1 >> u32( ( 32 - nodeVar0 ) ) ) );

}

fn mx_bjfinal ( a : u32, b : u32, c : u32 ) -> u32 {

	var nodeVar0 : u32;
	var nodeVar1 : u32;
	var nodeVar2 : u32;

	nodeVar0 = c;
	nodeVar1 = b;
	nodeVar2 = a;
	nodeVar0 = ( nodeVar0 ^ nodeVar1 );
	nodeVar0 = ( nodeVar0 - mx_rotl32( nodeVar1, 14 ) );
	nodeVar2 = ( nodeVar2 ^ nodeVar0 );
	nodeVar2 = ( nodeVar2 - mx_rotl32( nodeVar0, 11 ) );
	nodeVar1 = ( nodeVar1 ^ nodeVar2 );
	nodeVar1 = ( nodeVar1 - mx_rotl32( nodeVar2, 25 ) );
	nodeVar0 = ( nodeVar0 ^ nodeVar1 );
	nodeVar0 = ( nodeVar0 - mx_rotl32( nodeVar1, 16 ) );
	nodeVar2 = ( nodeVar2 ^ nodeVar0 );
	nodeVar2 = ( nodeVar2 - mx_rotl32( nodeVar0, 4 ) );
	nodeVar1 = ( nodeVar1 ^ nodeVar2 );
	nodeVar1 = ( nodeVar1 - mx_rotl32( nodeVar2, 14 ) );
	nodeVar0 = ( nodeVar0 ^ nodeVar1 );
	nodeVar0 = ( nodeVar0 - mx_rotl32( nodeVar1, 24 ) );

	return nodeVar0;

}

fn mx_select ( b : bool, t : f32, f : f32 ) -> f32 {

	var nodeVar0 : f32;
	var nodeVar1 : f32;
	var nodeVar2 : bool;
	var nodeVar3 : f32;

	nodeVar0 = f;
	nodeVar1 = t;
	nodeVar2 = b;

	return select( nodeVar0, nodeVar1, nodeVar2 );

}

fn mx_negate_if ( val : f32, b : bool ) -> f32 {

	var nodeVar0 : bool;
	var nodeVar1 : f32;
	var nodeVar2 : f32;

	nodeVar0 = b;
	nodeVar1 = val;

	return select( nodeVar1, ( - nodeVar1 ), nodeVar0 );

}

fn mx_floor ( x : f32 ) -> i32 {

	var nodeVar0 : f32;

	nodeVar0 = x;

	return i32( floor( nodeVar0 ) );

}

fn mx_fade ( t : f32 ) -> f32 {

	var nodeVar0 : f32;

	nodeVar0 = t;

	return ( ( ( nodeVar0 * nodeVar0 ) * nodeVar0 ) * ( ( nodeVar0 * ( ( nodeVar0 * 6.0 ) - 15.0 ) ) + 10.0 ) );

}

fn mx_hash_int_2 ( x : i32, y : i32, z : i32 ) -> u32 {

	var nodeVar0 : i32;
	var nodeVar1 : i32;
	var nodeVar2 : i32;
	var nodeVar3 : u32;
	var nodeVar4 : u32;
	var nodeVar5 : u32;
	var nodeVar6 : u32;

	nodeVar0 = z;
	nodeVar1 = y;
	nodeVar2 = x;
	nodeVar3 = 3u;
	nodeVar4 = 0u;
	nodeVar5 = 0u;
	nodeVar6 = 0u;
	nodeVar6 = ( ( 3735928559u + ( nodeVar3 << 2u ) ) + 13u );
	nodeVar5 = nodeVar6;
	nodeVar4 = nodeVar5;
	nodeVar4 = ( nodeVar4 + u32( nodeVar2 ) );
	nodeVar5 = ( nodeVar5 + u32( nodeVar1 ) );
	nodeVar6 = ( nodeVar6 + u32( nodeVar0 ) );

	return mx_bjfinal( nodeVar4, nodeVar5, nodeVar6 );

}

fn mx_gradient_float_1 ( hash : u32, x : f32, y : f32, z : f32 ) -> f32 {

	var nodeVar0 : f32;
	var nodeVar1 : f32;
	var nodeVar2 : f32;
	var nodeVar3 : u32;
	var nodeVar4 : u32;
	var nodeVar5 : f32;
	var nodeVar6 : f32;

	nodeVar0 = z;
	nodeVar1 = y;
	nodeVar2 = x;
	nodeVar3 = hash;
	nodeVar4 = ( nodeVar3 & 15u );
	nodeVar5 = mx_select( ( nodeVar4 < 8u ), nodeVar2, nodeVar1 );
	nodeVar6 = mx_select( ( nodeVar4 < 4u ), nodeVar1, mx_select( ( ( nodeVar4 == 12u ) || ( nodeVar4 == 14u ) ), nodeVar2, nodeVar0 ) );

	return ( mx_negate_if( nodeVar5, bool( ( nodeVar4 & 1u ) ) ) + mx_negate_if( nodeVar6, bool( ( nodeVar4 & 2u ) ) ) );

}

fn mx_trilerp_0 ( v0 : f32, v1 : f32, v2 : f32, v3 : f32, v4 : f32, v5 : f32, v6 : f32, v7 : f32, s : f32, t : f32, r : f32 ) -> f32 {

	var nodeVar0 : f32;
	var nodeVar1 : f32;
	var nodeVar2 : f32;
	var nodeVar3 : f32;
	var nodeVar4 : f32;
	var nodeVar5 : f32;
	var nodeVar6 : f32;
	var nodeVar7 : f32;
	var nodeVar8 : f32;
	var nodeVar9 : f32;
	var nodeVar10 : f32;
	var nodeVar11 : f32;
	var nodeVar12 : f32;
	var nodeVar13 : f32;

	nodeVar0 = r;
	nodeVar1 = t;
	nodeVar2 = s;
	nodeVar3 = v7;
	nodeVar4 = v6;
	nodeVar5 = v5;
	nodeVar6 = v4;
	nodeVar7 = v3;
	nodeVar8 = v2;
	nodeVar9 = v1;
	nodeVar10 = v0;
	nodeVar11 = ( 1.0 - nodeVar2 );
	nodeVar12 = ( 1.0 - nodeVar1 );
	nodeVar13 = ( 1.0 - nodeVar0 );

	return ( ( nodeVar13 * ( ( nodeVar12 * ( ( nodeVar10 * nodeVar11 ) + ( nodeVar9 * nodeVar2 ) ) ) + ( nodeVar1 * ( ( nodeVar8 * nodeVar11 ) + ( nodeVar7 * nodeVar2 ) ) ) ) ) + ( nodeVar0 * ( ( nodeVar12 * ( ( nodeVar6 * nodeVar11 ) + ( nodeVar5 * nodeVar2 ) ) ) + ( nodeVar1 * ( ( nodeVar4 * nodeVar11 ) + ( nodeVar3 * nodeVar2 ) ) ) ) ) );

}

fn mx_gradient_scale3d_0 ( v : f32 ) -> f32 {

	var nodeVar0 : f32;

	nodeVar0 = v;

	return ( 0.982 * nodeVar0 );

}

fn mx_perlin_noise_float_1 ( p : vec3<f32> ) -> f32 {

	var nodeVar0 : vec3<f32>;
	var nodeVar1 : i32;
	var nodeVar2 : i32;
	var nodeVar3 : i32;
	var nodeVar4 : f32;
	var nodeVar5 : f32;
	var nodeVar6 : f32;
	var nodeVar7 : f32;
	var nodeVar8 : f32;
	var nodeVar9 : f32;
	var nodeVar10 : f32;
	var nodeVar11 : f32;
	var nodeVar12 : f32;
	var nodeVar13 : f32;

	nodeVar0 = p;
	nodeVar1 = 0;
	nodeVar2 = 0;
	nodeVar3 = 0;
	nodeVar4 = nodeVar0.x;
	nodeVar1 = mx_floor( nodeVar4 );
	nodeVar5 = ( nodeVar4 - f32( nodeVar1 ) );
	nodeVar6 = nodeVar0.y;
	nodeVar2 = mx_floor( nodeVar6 );
	nodeVar7 = ( nodeVar6 - f32( nodeVar2 ) );
	nodeVar8 = nodeVar0.z;
	nodeVar3 = mx_floor( nodeVar8 );
	nodeVar9 = ( nodeVar8 - f32( nodeVar3 ) );
	nodeVar10 = mx_fade( nodeVar5 );
	nodeVar11 = mx_fade( nodeVar7 );
	nodeVar12 = mx_fade( nodeVar9 );
	nodeVar13 = mx_trilerp_0( mx_gradient_float_1( mx_hash_int_2( nodeVar1, nodeVar2, nodeVar3 ), nodeVar5, nodeVar7, nodeVar9 ), mx_gradient_float_1( mx_hash_int_2( ( nodeVar1 + 1 ), nodeVar2, nodeVar3 ), ( nodeVar5 - 1.0 ), nodeVar7, nodeVar9 ), mx_gradient_float_1( mx_hash_int_2( nodeVar1, ( nodeVar2 + 1 ), nodeVar3 ), nodeVar5, ( nodeVar7 - 1.0 ), nodeVar9 ), mx_gradient_float_1( mx_hash_int_2( ( nodeVar1 + 1 ), ( nodeVar2 + 1 ), nodeVar3 ), ( nodeVar5 - 1.0 ), ( nodeVar7 - 1.0 ), nodeVar9 ), mx_gradient_float_1( mx_hash_int_2( nodeVar1, nodeVar2, ( nodeVar3 + 1 ) ), nodeVar5, nodeVar7, ( nodeVar9 - 1.0 ) ), mx_gradient_float_1( mx_hash_int_2( ( nodeVar1 + 1 ), nodeVar2, ( nodeVar3 + 1 ) ), ( nodeVar5 - 1.0 ), nodeVar7, ( nodeVar9 - 1.0 ) ), mx_gradient_float_1( mx_hash_int_2( nodeVar1, ( nodeVar2 + 1 ), ( nodeVar3 + 1 ) ), nodeVar5, ( nodeVar7 - 1.0 ), ( nodeVar9 - 1.0 ) ), mx_gradient_float_1( mx_hash_int_2( ( nodeVar1 + 1 ), ( nodeVar2 + 1 ), ( nodeVar3 + 1 ) ), ( nodeVar5 - 1.0 ), ( nodeVar7 - 1.0 ), ( nodeVar9 - 1.0 ) ), nodeVar10, nodeVar11, nodeVar12 );

	return mx_gradient_scale3d_0( nodeVar13 );

}

fn V_GGX_SmithCorrelated ( alpha : f32, dotNL : f32, dotNV : f32 ) -> f32 {

	var nodeVar0 : f32;

	nodeVar0 = ( alpha * alpha );

	return ( 0.5 / max( ( ( dotNL * sqrt( ( nodeVar0 + ( ( 1.0 - nodeVar0 ) * ( dotNV * dotNV ) ) ) ) ) + ( dotNV * sqrt( ( nodeVar0 + ( ( 1.0 - nodeVar0 ) * ( dotNL * dotNL ) ) ) ) ) ), 0.000001 ) );

}

fn D_GGX ( alpha : f32, dotNH : f32 ) -> f32 {

	var nodeVar0 : f32;
	var nodeVar1 : f32;

	nodeVar0 = ( alpha * alpha );
	nodeVar1 = ( 1.0 - ( ( dotNH * dotNH ) * ( 1.0 - nodeVar0 ) ) );

	return ( ( nodeVar0 / ( nodeVar1 * nodeVar1 ) ) * 0.3183098861837907 );

}



@fragment
fn main( @location( 0 ) v_positionWorld : vec3<f32>,
	@location( 1 ) v_normalViewGeometry : vec3<f32>,
	@location( 2 ) v_positionViewDirection : vec3<f32> ) -> OutputStruct {

	// flow
	// code

	normalViewGeometry = normalize( v_normalViewGeometry );
	NORMAL_normalView = normalViewGeometry;
	normalView = NORMAL_normalView;
	normalWorld = normalize( ( vec4<f32>( normalView, 0.0 ) * render.cameraViewMatrix ).xyz );
	nodeVar0 = ( smoothstep( object.nodeUniform2, object.nodeUniform3, v_positionWorld.y ) * smoothstep( 0.45, 0.72, normalWorld.y ) );
	nodeVar1 = ( ( pow( max( ( ( mx_perlin_noise_float_1( ( v_positionWorld * vec3<f32>( 38.0 ) ) ) * 1.0 ) + 0.0 ), 0.0 ), 8.0 ) * 0.35 ) * nodeVar0 );
	DiffuseColor = vec4<f32>( ( mix( mix( vec3<f32>( 0.012286488353353374, 0.023153366173251363, 0.057805430183792694 ), vec3<f32>( 0.06847816983662762, 0.11443537381770343, 0.24620132669705552 ), pow( clamp( ( v_positionWorld.y / object.nodeUniform1 ), 0.0, 1.0 ), 0.8 ) ), vec3<f32>( 0.6866853124288864, 0.775822218312646, 0.9046611743890203 ), nodeVar0 ) + vec3<f32>( nodeVar1 ) ), 1.0 );
	DiffuseColor.w = ( DiffuseColor.w * object.nodeUniform7 );
	DiffuseColor.w = 1.0;
	Metalness = object.nodeUniform8;
	nodeVar2 = max( abs( dpdx( normalViewGeometry ) ), abs( - dpdy( normalViewGeometry ) ) );
	Roughness = min( ( max( object.nodeUniform9, 0.0525 ) + max( max( nodeVar2.x, nodeVar2.y ), nodeVar2.z ) ), 1.0 );
	SpecularColor = vec3<f32>( 0.04, 0.04, 0.04 );
	SpecularColorBlended = mix( vec3<f32>( 0.04, 0.04, 0.04 ), DiffuseColor.xyz, Metalness );
	SpecularF90 = 1.0;
	DiffuseContribution = ( DiffuseColor.xyz * vec3<f32>( ( 1.0 - object.nodeUniform8 ) ) );
	EmissiveColor = ( ( ( vec3<f32>( 0.6866853124288864, 0.775822218312646, 0.9046611743890203 ) * vec3<f32>( nodeVar0 ) ) * vec3<f32>( 0.085 ) ) + vec3<f32>( ( nodeVar1 * 0.5 ) ) );
	irradiance = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar3 = ( irradiance + render.nodeUniform10 );
	irradiance = nodeVar3;
	nodeVar4 = ( render.nodeUniform11 - render.nodeUniform12 );
	nodeVar5 = vec4<f32>( nodeVar4, 0.0 );
	nodeVar6 = ( render.cameraViewMatrix * nodeVar5 );
	nodeVar7 = normalize( nodeVar6.xyz );
	nodeVar8 = nodeVar7;
	nodeVar9 = dot( normalView, nodeVar8 );
	nodeVar10 = ( vec3<f32>( clamp( nodeVar9, 0.0, 1.0 ) ) * render.nodeUniform13 );
	nodeVar11 = nodeVar10;
	directDiffuse = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar12 = ( DiffuseContribution * vec3<f32>( 0.3183098861837907 ) );
	nodeVar13 = ( nodeVar11 * nodeVar12 );
	nodeVar14 = ( directDiffuse + nodeVar13 );
	directDiffuse = nodeVar14;
	directSpecular = vec3<f32>( 0.0, 0.0, 0.0 );
	positionViewDirection = normalize( v_positionViewDirection );
	nodeVar15 = normalize( ( nodeVar8 + positionViewDirection ) );
	nodeVar16 = clamp( dot( positionViewDirection, nodeVar15 ), 0.0, 1.0 );
	nodeVar17 = exp2( ( ( ( nodeVar16 * -5.55473 ) - 6.98316 ) * nodeVar16 ) );
	nodeVar18 = ( Roughness * Roughness );
	nodeVar19 = textureSample( nodeUniform14, nodeUniform14_sampler, vec2<f32>( Roughness, clamp( dot( normalView, positionViewDirection ), 0.0, 1.0 ) ) );
	nodeVar20 = textureSample( nodeUniform14, nodeUniform14_sampler, vec2<f32>( Roughness, clamp( dot( normalView, nodeVar8 ), 0.0, 1.0 ) ) );
	nodeVar21 = ( SpecularColorBlended + ( ( vec3<f32>( 1.0 ) - SpecularColorBlended ) * vec3<f32>( 0.047619 ) ) );
	nodeVar22 = ( 1.0 - ( nodeVar19.xy.x + nodeVar19.xy.y ) );
	nodeVar23 = ( 1.0 - ( nodeVar20.xy.x + nodeVar20.xy.y ) );
	nodeVar24 = ( ( ( ( ( SpecularColorBlended * vec3<f32>( ( 1.0 - nodeVar17 ) ) ) + vec3<f32>( ( 1.0 * nodeVar17 ) ) ) * vec3<f32>( V_GGX_SmithCorrelated( nodeVar18, clamp( dot( normalView, nodeVar8 ), 0.0, 1.0 ), clamp( dot( normalView, positionViewDirection ), 0.0, 1.0 ) ) ) ) * vec3<f32>( D_GGX( nodeVar18, clamp( dot( normalView, nodeVar15 ), 0.0, 1.0 ) ) ) ) + ( ( ( ( ( ( SpecularColorBlended * vec3<f32>( nodeVar19.xy.x ) ) + vec3<f32>( ( 1.0 * nodeVar19.xy.y ) ) ) * ( ( SpecularColorBlended * vec3<f32>( nodeVar20.xy.x ) ) + vec3<f32>( ( 1.0 * nodeVar20.xy.y ) ) ) ) * nodeVar21 ) / ( ( vec3<f32>( 1.0 ) - ( ( vec3<f32>( ( nodeVar22 * nodeVar23 ) ) * nodeVar21 ) * nodeVar21 ) ) + vec3<f32>( 0.000001 ) ) ) * vec3<f32>( ( nodeVar22 * nodeVar23 ) ) ) );
	nodeVar25 = ( nodeVar11 * nodeVar24 );
	nodeVar26 = ( directSpecular + nodeVar25 );
	directSpecular = nodeVar26;
	nodeVar27 = ( DiffuseContribution * vec3<f32>( 0.3183098861837907 ) );
	nodeVar28 = ( irradiance * nodeVar27 );
	nodeVar29 = nodeVar28;
	indirectDiffuse = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar30 = ( indirectDiffuse + nodeVar29 );
	indirectDiffuse = nodeVar30;
	singleScatteringDielectric = vec3<f32>( 0.0, 0.0, 0.0 );
	multiScatteringDielectric = vec3<f32>( 0.0, 0.0, 0.0 );
	singleScatteringMetallic = vec3<f32>( 0.0, 0.0, 0.0 );
	multiScatteringMetallic = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar31 = dot( normalView, positionViewDirection );
	nodeVar32 = textureSample( nodeUniform14, nodeUniform14_sampler, vec2<f32>( Roughness, clamp( nodeVar31, 0.0, 1.0 ) ) );
	nodeVar33 = ( SpecularColor * vec3<f32>( nodeVar32.xy.x ) );
	nodeVar34 = ( SpecularF90 * nodeVar32.xy.y );
	nodeVar35 = ( nodeVar33 + vec3<f32>( nodeVar34 ) );
	nodeVar36 = ( singleScatteringDielectric + nodeVar35 );
	singleScatteringDielectric = nodeVar36;
	nodeVar37 = ( vec3<f32>( 1.0 ) - SpecularColor );
	nodeVar38 = nodeVar37;
	nodeVar39 = ( nodeVar38 * vec3<f32>( 0.047619 ) );
	nodeVar40 = ( SpecularColor + nodeVar39 );
	nodeVar41 = ( nodeVar35 * nodeVar40 );
	nodeVar42 = ( nodeVar32.xy.x + nodeVar32.xy.y );
	nodeVar43 = ( 1.0 - nodeVar42 );
	nodeVar44 = nodeVar43;
	nodeVar45 = ( vec3<f32>( nodeVar44 ) * nodeVar40 );
	nodeVar46 = ( vec3<f32>( 1.0 ) - nodeVar45 );
	nodeVar47 = nodeVar46;
	nodeVar48 = ( nodeVar41 / nodeVar47 );
	nodeVar49 = ( nodeVar48 * vec3<f32>( nodeVar44 ) );
	nodeVar50 = ( multiScatteringDielectric + nodeVar49 );
	multiScatteringDielectric = nodeVar50;
	nodeVar51 = dot( normalView, positionViewDirection );
	nodeVar52 = textureSample( nodeUniform14, nodeUniform14_sampler, vec2<f32>( Roughness, clamp( nodeVar51, 0.0, 1.0 ) ) );
	nodeVar53 = ( DiffuseColor.xyz * vec3<f32>( nodeVar52.xy.x ) );
	nodeVar54 = ( SpecularF90 * nodeVar52.xy.y );
	nodeVar55 = ( nodeVar53 + vec3<f32>( nodeVar54 ) );
	nodeVar56 = ( singleScatteringMetallic + nodeVar55 );
	singleScatteringMetallic = nodeVar56;
	nodeVar57 = ( vec3<f32>( 1.0 ) - DiffuseColor.xyz );
	nodeVar58 = nodeVar57;
	nodeVar59 = ( nodeVar58 * vec3<f32>( 0.047619 ) );
	nodeVar60 = ( DiffuseColor.xyz + nodeVar59 );
	nodeVar61 = ( nodeVar55 * nodeVar60 );
	nodeVar62 = ( nodeVar52.xy.x + nodeVar52.xy.y );
	nodeVar63 = ( 1.0 - nodeVar62 );
	nodeVar64 = nodeVar63;
	nodeVar65 = ( vec3<f32>( nodeVar64 ) * nodeVar60 );
	nodeVar66 = ( vec3<f32>( 1.0 ) - nodeVar65 );
	nodeVar67 = nodeVar66;
	nodeVar68 = ( nodeVar61 / nodeVar67 );
	nodeVar69 = ( nodeVar68 * vec3<f32>( nodeVar64 ) );
	nodeVar70 = ( multiScatteringMetallic + nodeVar69 );
	multiScatteringMetallic = nodeVar70;
	radiance = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar71 = mix( singleScatteringDielectric, singleScatteringMetallic, Metalness );
	nodeVar72 = ( radiance * nodeVar71 );
	nodeVar73 = mix( multiScatteringDielectric, multiScatteringMetallic, Metalness );
	iblIrradiance = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar74 = ( iblIrradiance * vec3<f32>( 0.3183098861837907 ) );
	nodeVar75 = ( nodeVar73 * nodeVar74 );
	nodeVar76 = ( nodeVar72 + nodeVar75 );
	nodeVar77 = nodeVar76;
	nodeVar78 = ( singleScatteringDielectric + multiScatteringDielectric );
	nodeVar79 = ( vec3<f32>( 1.0 ) - nodeVar78 );
	nodeVar80 = nodeVar79;
	nodeVar81 = ( DiffuseContribution * nodeVar80 );
	nodeVar82 = ( nodeVar81 * nodeVar74 );
	nodeVar83 = nodeVar82;
	indirectSpecular = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar84 = ( indirectSpecular + nodeVar77 );
	indirectSpecular = nodeVar84;
	nodeVar85 = ( indirectDiffuse + nodeVar83 );
	indirectDiffuse = nodeVar85;
	ambientOcclusion = 1.0;
	nodeVar86 = ( indirectDiffuse * vec3<f32>( ambientOcclusion ) );
	indirectDiffuse = nodeVar86;
	nodeVar87 = dot( normalView, positionViewDirection );
	nodeVar88 = ( clamp( nodeVar87, 0.0, 1.0 ) + ambientOcclusion );
	nodeVar89 = ( Roughness * -16.0 );
	nodeVar90 = ( 1.0 - nodeVar89 );
	nodeVar91 = nodeVar90;
	nodeVar92 = ( - nodeVar91 );
	nodeVar93 = exp2( nodeVar92 );
	nodeVar94 = pow( nodeVar88, nodeVar93 );
	nodeVar95 = ( 1.0 - nodeVar94 );
	nodeVar96 = nodeVar95;
	nodeVar97 = ( ambientOcclusion - nodeVar96 );
	nodeVar98 = ( indirectSpecular * vec3<f32>( clamp( nodeVar97, 0.0, 1.0 ) ) );
	indirectSpecular = nodeVar98;
	nodeVar99 = ( directDiffuse + indirectDiffuse );
	totalDiffuse = nodeVar99;
	nodeVar100 = ( directSpecular + indirectSpecular );
	totalSpecular = nodeVar100;
	nodeVar101 = ( totalDiffuse + totalSpecular );
	outgoingLight = nodeVar101;
	nodeVar102 = max( vec4<f32>( ( outgoingLight + EmissiveColor ), DiffuseColor.w ), vec4<f32>( 0.0 ) );
	Output = nodeVar102;

	// result

	output.color = nodeVar102;

	return output;

}

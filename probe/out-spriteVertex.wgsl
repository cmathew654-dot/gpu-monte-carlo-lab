// Three.js r185 - Node System

// directives


// structs


// uniforms

struct NodeBuffer_968Struct {
	value : array< u32 >
};
@binding( 4 ) @group( 1 )
var<storage, read> NodeBuffer_968 : NodeBuffer_968Struct;

struct NodeBuffer_971Struct {
	value : array< f32 >
};
@binding( 5 ) @group( 1 )
var<storage, read> NodeBuffer_971 : NodeBuffer_971Struct;

struct NodeBuffer_965Struct {
	value : array< f32 >
};
@binding( 6 ) @group( 1 )
var<storage, read> NodeBuffer_965 : NodeBuffer_965Struct;

struct objectStruct {
	nodeUniform1 : u32,
	nodeUniform2 : u32,
	nodeUniform3 : u32,
	nodeUniform4 : u32,
	nodeUniform5 : u32,
	nodeUniform6 : f32,
	nodeUniform8 : f32,
	nodeUniform9 : f32,
	nodeUniform10 : u32,
	nodeUniform12 : u32,
	nodeUniform13 : u32,
	nodeUniform14 : u32,
	nodeUniform16 : u32,
	nodeUniform17 : u32,
	nodeUniform18 : u32,
	nodeUniform19 : u32,
	nodeUniform22 : f32,
	nodeUniform23 : f32,
	nodeUniform24 : f32,
	nodeUniform25 : f32,
	nodeUniform26 : u32,
	nodeUniform27 : u32,
	nodeUniform28 : u32,
	nodeUniform30 : f32,
	nodeUniform31 : f32,
	nodeUniform34 : mat4x4<f32>,
	nodeUniform35 : f32,
	nodeUniform36 : vec2<f32>,
	nodeUniform37 : u32,
	nodeUniform38 : u32,
	nodeUniform39 : u32,
	nodeUniform40 : u32
};
@binding( 0 ) @group( 1 )
var<uniform> object : objectStruct;

struct renderStruct {
	cameraProjectionMatrix : mat4x4<f32>,
	cameraViewMatrix : mat4x4<f32>,
	cameraPosition : vec3<f32>
};
@binding( 0 ) @group( 0 )
var<uniform> render : renderStruct;

// varyings

struct VaryingsStruct {
	@location( 0 ) @interpolate(flat, either) nodeVarying4 : u32,
	@builtin( position ) builtinClipSpace : vec4<f32>
};
var<private> varyings : VaryingsStruct;

// vars
var<private> nodeVar0 : f32;
var<private> nodeVar1 : f32;
var<private> nodeVar2 : u32;
var<private> nodeVar3 : bool;
var<private> nodeVar4 : u32;
var<private> nodeVar5 : f32;
var<private> nodeVar6 : bool;
var<private> nodeVar7 : u32;
var<private> nodeVar8 : u32;
var<private> nodeVar9 : bool;
var<private> nodeVar10 : f32;
var<private> nodeVar11 : f32;
var<private> nodeVar12 : u32;
var<private> nodeVar13 : u32;
var<private> nodeVar14 : u32;
var<private> nodeVar15 : u32;
var<private> nodeVar16 : u32;
var<private> nodeVar17 : u32;
var<private> nodeVar18 : f32;
var<private> nodeVar19 : f32;
var<private> nodeVar20 : u32;
var<private> nodeVar21 : u32;
var<private> nodeVar22 : u32;
var<private> nodeVar23 : u32;
var<private> nodeVar24 : u32;
var<private> nodeVar25 : vec3<f32>;
var<private> modelViewMatrix : mat4x4<f32>;
var<private> nodeVar61 : vec4<f32>;
var<private> nodeVar62 : f32;
var<private> nodeVar63 : f32;
var<private> nodeVar64 : u32;
var<private> nodeVar65 : u32;
var<private> nodeVar66 : f32;
var<private> nodeVar67 : f32;
var<private> nodeVar68 : bool;
var<private> nodeVar69 : f32;
var<private> nodeVar70 : f32;
var<private> VERTEX_nodeVar71 : vec4<f32>;
var<private> positionLocal : vec3<f32>;
var<private> v_modelViewProjection : vec4<f32>;
var<private> v_positionView : vec4<f32>;
var<private> VERTEX_v_modelViewProjection : vec4<f32>;

// codes


@vertex
fn main( @builtin( instance_index ) instanceIndex : u32,
	@location( 0 ) position : vec3<f32> ) -> VaryingsStruct {

	// flow
	// code

	positionLocal = position;
	nodeVar1 = floor( ( f32( instanceIndex ) / f32( object.nodeUniform1 ) ) );
	nodeVar2 = ( u32( nodeVar1 ) * object.nodeUniform2 );
	nodeVar3 = ( NodeBuffer_968.value[ nodeVar2 ] > 0u );
	nodeVar5 = ( f32( instanceIndex ) - ( nodeVar1 * f32( object.nodeUniform1 ) ) );
	nodeVar6 = ( u32( nodeVar5 ) == ( object.nodeUniform1 - 1u ) );

	if ( nodeVar6 ) {

		nodeVar4 = ( object.nodeUniform3 - 1u );

	} else {

		nodeVar4 = ( u32( nodeVar5 ) * object.nodeUniform4 );

	}

	nodeVar8 = ( ( ( ( ( ( NodeBuffer_968.value[ nodeVar2 ] - 1u ) / object.nodeUniform5 ) + 1u ) + ( object.nodeUniform4 - 1u ) ) / object.nodeUniform4 ) * object.nodeUniform4 );

	if ( ( nodeVar8 > ( ( object.nodeUniform1 - 2u ) * object.nodeUniform4 ) ) ) {

		nodeVar7 = ( object.nodeUniform3 - 1u );

	} else {

		nodeVar7 = nodeVar8;

	}

	nodeVar9 = ( nodeVar3 && ( nodeVar4 == nodeVar7 ) );

	if ( nodeVar9 ) {

		nodeVar0 = ( ( f32( NodeBuffer_968.value[ nodeVar2 ] ) - 1.0 ) / object.nodeUniform6 );

	} else {


		if ( nodeVar6 ) {

			nodeVar10 = ( f32( object.nodeUniform3 ) - 1.0 );

		} else {

			nodeVar10 = ( nodeVar5 * f32( object.nodeUniform4 ) );

		}

		nodeVar0 = ( ( nodeVar10 * f32( object.nodeUniform5 ) ) / object.nodeUniform6 );

	}


	if ( nodeVar9 ) {


		if ( ( nodeVar4 == 0u ) ) {

			nodeVar12 = 0u;

		} else {

			nodeVar12 = ( nodeVar4 - 1u );

		}

		nodeVar13 = ( nodeVar2 * 64u );
		nodeVar14 = ( ( ( nodeVar13 + 404u ) * 747796405u ) + 2891336453u );
		nodeVar15 = ( ( ( nodeVar14 >> ( ( nodeVar14 >> 28u ) + 4u ) ) ^ nodeVar14 ) * 277803737u );
		nodeVar16 = ( ( ( nodeVar13 + 505u ) * 747796405u ) + 2891336453u );
		nodeVar17 = ( ( ( nodeVar16 >> ( ( nodeVar16 >> 28u ) + 4u ) ) ^ nodeVar16 ) * 277803737u );
		nodeVar18 = ( ( nodeVar0 * 0.96 ) + ( ( f32( ( ( nodeVar17 >> 22u ) ^ nodeVar17 ) ) * 2.3283064365386963e-10 ) * 0.04 ) );
		nodeVar11 = mix( clamp( ( ( ( log( max( NodeBuffer_971.value[ ( ( nodeVar2 * 32u ) + nodeVar12 ) ], 1.0 ) ) * 0.43429448190325176 ) - object.nodeUniform8 ) * 4.0 ), -8.0, 8.0 ), ( -9.2 + ( ( ( f32( ( ( nodeVar15 >> 22u ) ^ nodeVar15 ) ) * 2.3283064365386963e-10 ) - 0.5 ) * 1.0 ) ), smoothstep( nodeVar18, ( nodeVar18 + 0.2 ), object.nodeUniform9 ) );

	} else {


		if ( ( nodeVar4 < object.nodeUniform10 ) ) {

			nodeVar19 = NodeBuffer_971.value[ ( ( nodeVar2 * 32u ) + nodeVar4 ) ];

		} else {

			nodeVar19 = NodeBuffer_965.value[ nodeVar2 ];

		}

		nodeVar11 = clamp( ( ( ( log( max( nodeVar19, 1.0 ) ) * 0.43429448190325176 ) - object.nodeUniform8 ) * 4.0 ), -8.0, 8.0 );

	}

	nodeVar20 = ( nodeVar2 * 64u );
	nodeVar21 = ( ( ( nodeVar20 + 101u ) * 747796405u ) + 2891336453u );
	nodeVar22 = ( ( ( nodeVar21 >> ( ( nodeVar21 >> 28u ) + 4u ) ) ^ nodeVar21 ) * 277803737u );
	nodeVar23 = ( ( ( nodeVar20 + 202u ) * 747796405u ) + 2891336453u );
	nodeVar24 = ( ( ( nodeVar23 >> ( ( nodeVar23 >> 28u ) + 4u ) ) ^ nodeVar23 ) * 277803737u );
	nodeVar25 = vec3<f32>( ( ( nodeVar0 - 0.5 ) * 26.0 ), nodeVar11, ( cos( ( ( f32( ( ( nodeVar22 >> 22u ) ^ nodeVar22 ) ) * 2.3283064365386963e-10 ) * 6.283185307179586 ) ) * ( sqrt( ( f32( ( ( nodeVar24 >> 22u ) ^ nodeVar24 ) ) * 2.3283064365386963e-10 ) ) * 2.4 ) ) );
	positionLocal = nodeVar25;
	varyings.nodeVarying4 = instanceIndex;
	modelViewMatrix = ( render.cameraViewMatrix * object.nodeUniform34 );
	nodeVar61 = ( modelViewMatrix * vec4<f32>( nodeVar25, 1.0 ) );
	nodeVar62 = cos( object.nodeUniform35 );
	nodeVar63 = sin( object.nodeUniform35 );
	nodeVar64 = ( ( ( nodeVar20 + 505u ) * 747796405u ) + 2891336453u );
	nodeVar65 = ( ( ( nodeVar64 >> ( ( nodeVar64 >> 28u ) + 4u ) ) ^ nodeVar64 ) * 277803737u );
	nodeVar66 = ( ( nodeVar0 * 0.96 ) + ( ( f32( ( ( nodeVar65 >> 22u ) ^ nodeVar65 ) ) * 2.3283064365386963e-10 ) * 0.04 ) );
	nodeVar68 = ( nodeVar2 == object.nodeUniform40 );

	if ( ( ( ( ( ( instanceIndex < object.nodeUniform37 ) && ( ( u32( nodeVar1 ) % object.nodeUniform38 ) == 0u ) ) && ( ! ( nodeVar3 && ( nodeVar4 > nodeVar7 ) ) ) ) && ( u32( nodeVar5 ) > 0u ) ) && ( ( ( object.nodeUniform39 == 0u ) || nodeVar9 ) || nodeVar68 ) ) ) {

		nodeVar67 = 1.0;

	} else {

		nodeVar67 = 0.0;

	}


	if ( nodeVar9 ) {

		nodeVar69 = 2.0;

	} else {

		nodeVar69 = 1.0;

	}


	if ( nodeVar68 ) {

		nodeVar70 = 1.5;

	} else {

		nodeVar70 = 1.0;

	}

	v_positionView = vec4<f32>( ( nodeVar61.xy + ( mat2x2<f32>( nodeVar62, nodeVar63, ( - nodeVar63 ), nodeVar62 ) * ( ( position.xy - ( object.nodeUniform36 - vec2<f32>( 0.5 ) ) ) * ( vec2<f32>( length( object.nodeUniform34[ 0u ].xyz ), length( object.nodeUniform34[ 1u ].xyz ) ) * ( ( ( vec2<f32>( 0.075, 0.075 ) * vec2<f32>( ( smoothstep( nodeVar66, ( nodeVar66 + 0.02 ), object.nodeUniform9 ) * nodeVar67 ) ) ) * vec2<f32>( nodeVar69 ) ) * vec2<f32>( nodeVar70 ) ) ) ) ) ), nodeVar61.zw );
	VERTEX_nodeVar71 = ( render.cameraProjectionMatrix * v_positionView );
	VERTEX_v_modelViewProjection = VERTEX_nodeVar71;

	// result

	varyings.builtinClipSpace = VERTEX_v_modelViewProjection;

	return varyings;

}

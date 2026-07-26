// Three.js r185 - Node System

// directives


// structs


// uniforms

struct NodeBuffer_991Struct {
	value : array< f32 >
};
@binding( 1 ) @group( 1 )
var<storage, read> NodeBuffer_991 : NodeBuffer_991Struct;

struct NodeBuffer_968Struct {
	value : array< u32 >
};
@binding( 2 ) @group( 1 )
var<storage, read> NodeBuffer_968 : NodeBuffer_968Struct;

struct NodeBuffer_992Struct {
	value : array< f32 >
};
@binding( 3 ) @group( 1 )
var<storage, read> NodeBuffer_992 : NodeBuffer_992Struct;

struct NodeBuffer_971Struct {
	value : array< f32 >
};
@binding( 4 ) @group( 1 )
var<storage, read> NodeBuffer_971 : NodeBuffer_971Struct;

struct NodeBuffer_965Struct {
	value : array< f32 >
};
@binding( 5 ) @group( 1 )
var<storage, read> NodeBuffer_965 : NodeBuffer_965Struct;

struct NodeBuffer_994Struct {
	value : array< f32 >
};
@binding( 6 ) @group( 1 )
var<storage, read> NodeBuffer_994 : NodeBuffer_994Struct;

struct objectStruct {
	nodeUniform1 : u32,
	nodeUniform2 : u32,
	nodeUniform3 : u32,
	nodeUniform4 : u32,
	nodeUniform5 : u32,
	nodeUniform7 : u32,
	nodeUniform8 : u32,
	nodeUniform9 : u32,
	nodeUniform11 : u32,
	nodeUniform15 : f32,
	nodeUniform16 : f32,
	nodeUniform17 : f32,
	nodeUniform18 : f32,
	nodeUniform21 : mat4x4<f32>
};
@binding( 0 ) @group( 1 )
var<uniform> object : objectStruct;

struct renderStruct {
	cameraProjectionMatrix : mat4x4<f32>,
	cameraViewMatrix : mat4x4<f32>
};
@binding( 0 ) @group( 0 )
var<uniform> render : renderStruct;

// varyings

struct VaryingsStruct {
	@location( 0 ) nodeVarying3 : vec4<f32>,
	@builtin( position ) builtinClipSpace : vec4<f32>
};
var<private> varyings : VaryingsStruct;

// vars
var<private> nodeVar0 : u32;
var<private> nodeVar1 : u32;
var<private> nodeVar2 : u32;
var<private> nodeVar3 : u32;
var<private> nodeVar4 : u32;
var<private> nodeVar5 : bool;
var<private> nodeVar6 : u32;
var<private> nodeVar7 : u32;
var<private> nodeVar8 : f32;
var<private> nodeVar9 : u32;
var<private> nodeVar10 : bool;
var<private> nodeVar11 : u32;
var<private> nodeVar12 : u32;
var<private> nodeVar13 : u32;
var<private> nodeVar14 : u32;
var<private> nodeVar15 : u32;
var<private> nodeVar16 : bool;
var<private> nodeVar17 : f32;
var<private> nodeVar18 : f32;
var<private> nodeVar19 : f32;
var<private> nodeVar20 : f32;
var<private> nodeVar21 : u32;
var<private> nodeVar22 : vec3<f32>;
var<private> nodeVar23 : u32;
var<private> nodeVar24 : vec3<f32>;
var<private> nodeVar25 : f32;
var<private> nodeVar26 : vec3<f32>;
var<private> nodeVar27 : f32;
var<private> nodeVar28 : u32;
var<private> nodeVar29 : f32;
var<private> nodeVar30 : f32;
var<private> nodeVar31 : u32;
var<private> nodeVar32 : u32;
var<private> nodeVar33 : u32;
var<private> nodeVar34 : u32;
var<private> nodeVar35 : u32;
var<private> nodeVar36 : vec3<f32>;
var<private> nodeVar37 : bool;
var<private> nodeVar38 : vec3<f32>;
var<private> nodeVar39 : u32;
var<private> nodeVar40 : u32;
var<private> nodeVar41 : f32;
var<private> nodeVar42 : f32;
var<private> nodeVar43 : f32;
var<private> modelViewMatrix : mat4x4<f32>;
var<private> VERTEX_nodeVar45 : vec4<f32>;
var<private> positionLocal : vec3<f32>;
var<private> v_modelViewProjection : vec4<f32>;
var<private> v_positionView : vec3<f32>;
var<private> VERTEX_v_modelViewProjection : vec4<f32>;

// codes


@vertex
fn main( @builtin( vertex_index ) vertexIndex : u32,
	@location( 0 ) position : vec3<f32> ) -> VaryingsStruct {

	// flow
	// code

	positionLocal = position;
	nodeVar1 = ( vertexIndex / 2u );
	nodeVar2 = ( object.nodeUniform1 - 1u );
	nodeVar3 = ( nodeVar1 / nodeVar2 );
	nodeVar4 = ( nodeVar3 * object.nodeUniform2 );
	nodeVar5 = ( nodeVar4 == object.nodeUniform3 );

	if ( nodeVar5 ) {

		nodeVar0 = object.nodeUniform4;

	} else {

		nodeVar6 = ( ( ( ( nodeVar4 * 64u ) + 777u ) * 747796405u ) + 2891336453u );
		nodeVar7 = ( ( ( nodeVar6 >> ( ( nodeVar6 >> 28u ) + 4u ) ) ^ nodeVar6 ) * 277803737u );
		nodeVar0 = u32( min( ( ( f32( ( ( nodeVar7 >> 22u ) ^ nodeVar7 ) ) * 2.3283064365386963e-10 ) * f32( object.nodeUniform5 ) ), ( f32( object.nodeUniform5 ) - 1.0 ) ) );

	}

	nodeVar10 = ( NodeBuffer_968.value[ nodeVar4 ] > 0u );
	nodeVar11 = ( nodeVar1 - ( nodeVar3 * nodeVar2 ) );
	nodeVar12 = ( nodeVar11 + ( vertexIndex - ( nodeVar1 * 2u ) ) );
	nodeVar14 = ( ( ( ( ( ( NodeBuffer_968.value[ nodeVar4 ] - 1u ) / object.nodeUniform7 ) + 1u ) + ( object.nodeUniform8 - 1u ) ) / object.nodeUniform8 ) * object.nodeUniform8 );
	nodeVar15 = ( ( object.nodeUniform1 - 2u ) * object.nodeUniform8 );

	if ( ( nodeVar14 > nodeVar15 ) ) {

		nodeVar13 = ( object.nodeUniform9 - 1u );

	} else {

		nodeVar13 = nodeVar14;

	}


	if ( ( nodeVar10 && ( nodeVar12 > nodeVar13 ) ) ) {

		nodeVar9 = nodeVar13;

	} else {

		nodeVar9 = nodeVar12;

	}

	nodeVar16 = ( nodeVar9 == ( object.nodeUniform1 - 1u ) );

	if ( nodeVar16 ) {

		nodeVar8 = ( f32( object.nodeUniform9 ) - 1.0 );

	} else {


		if ( ( nodeVar10 && ( nodeVar12 > nodeVar13 ) ) ) {


			if ( ( nodeVar14 > nodeVar15 ) ) {

				nodeVar18 = ( f32( object.nodeUniform9 ) - 1.0 );

			} else {

				nodeVar18 = f32( nodeVar14 );

			}

			nodeVar17 = nodeVar18;

		} else {

			nodeVar17 = f32( nodeVar12 );

		}

		nodeVar8 = ( nodeVar17 * f32( object.nodeUniform8 ) );

	}

	nodeVar19 = clamp( ( nodeVar8 / ( f32( object.nodeUniform9 ) - 1.0 ) ), 0.0, 1.0 );
	nodeVar20 = ( nodeVar19 * 31.0 );
	nodeVar21 = ( ( ( nodeVar0 * 32u ) + u32( min( nodeVar20, 30.0 ) ) ) * 3u );
	nodeVar22 = vec3<f32>( NodeBuffer_991.value[ nodeVar21 ], NodeBuffer_991.value[ ( nodeVar21 + 1u ) ], NodeBuffer_991.value[ ( nodeVar21 + 2u ) ] );
	nodeVar23 = ( nodeVar21 + 3u );
	nodeVar24 = vec3<f32>( NodeBuffer_991.value[ nodeVar23 ], NodeBuffer_991.value[ ( nodeVar23 + 1u ) ], NodeBuffer_991.value[ ( nodeVar23 + 2u ) ] );
	nodeVar25 = ( nodeVar20 - f32( u32( min( nodeVar20, 30.0 ) ) ) );
	nodeVar26 = mix( vec3<f32>( NodeBuffer_992.value[ nodeVar21 ], NodeBuffer_992.value[ ( nodeVar21 + 1u ) ], NodeBuffer_992.value[ ( nodeVar21 + 2u ) ] ), vec3<f32>( NodeBuffer_992.value[ nodeVar23 ], NodeBuffer_992.value[ ( nodeVar23 + 1u ) ], NodeBuffer_992.value[ ( nodeVar23 + 2u ) ] ), nodeVar25 );

	if ( nodeVar16 ) {

		nodeVar28 = ( object.nodeUniform9 - 1u );

	} else {

		nodeVar28 = ( nodeVar9 * object.nodeUniform8 );

	}


	if ( ( nodeVar28 < object.nodeUniform11 ) ) {

		nodeVar27 = NodeBuffer_971.value[ ( ( nodeVar4 * 32u ) + nodeVar28 ) ];

	} else {

		nodeVar27 = NodeBuffer_965.value[ nodeVar4 ];

	}


	if ( nodeVar5 ) {

		nodeVar29 = 0.15;

	} else {

		nodeVar29 = 0.0;

	}


	if ( nodeVar5 ) {

		nodeVar30 = 0.0;

	} else {

		nodeVar31 = ( nodeVar4 * 64u );
		nodeVar32 = ( ( ( nodeVar31 + 888u ) * 747796405u ) + 2891336453u );
		nodeVar33 = ( ( ( nodeVar32 >> ( ( nodeVar32 >> 28u ) + 4u ) ) ^ nodeVar32 ) * 277803737u );
		nodeVar34 = ( ( ( nodeVar31 + 999u ) * 747796405u ) + 2891336453u );
		nodeVar35 = ( ( ( nodeVar34 >> ( ( nodeVar34 >> 28u ) + 4u ) ) ^ nodeVar34 ) * 277803737u );
		nodeVar30 = ( ( ( ( f32( ( ( nodeVar33 >> 22u ) ^ nodeVar33 ) ) * 2.3283064365386963e-10 ) - 0.5 ) * 3.5 ) + ( sin( ( ( nodeVar19 * 12.566370614359172 ) + ( ( f32( ( ( nodeVar35 >> 22u ) ^ nodeVar35 ) ) * 2.3283064365386963e-10 ) * 6.283185307179586 ) ) ) * 0.5 ) );

	}

	positionLocal = ( ( mix( nodeVar22, nodeVar24, nodeVar25 ) + ( nodeVar26 * vec3<f32>( ( ( 0.1 + clamp( ( ( ( log( max( nodeVar27, 1.0 ) ) * 0.43429448190325176 ) - NodeBuffer_994.value[ nodeVar28 ] ) * 1.0 ), -0.06, 1.4 ) ) + nodeVar29 ) ) ) ) + ( normalize( cross( ( nodeVar24 - nodeVar22 ), nodeVar26 ) ) * vec3<f32>( nodeVar30 ) ) );
	nodeVar37 = ( nodeVar10 && ( nodeVar28 == nodeVar13 ) );

	if ( ( nodeVar5 && ( ! nodeVar37 ) ) ) {

		nodeVar36 = vec3<f32>( 1.0, 0.71, 0.28 );

	} else {


		if ( nodeVar37 ) {

			nodeVar38 = ( vec3<f32>( 0.9646862478936612, 0.025186859622305935, 0.036889450395083165 ) * vec3<f32>( 0.6 ) );

		} else {

			nodeVar38 = mix( vec3<f32>( 0.02955683443236377, 0.21586050010324417, 1.0 ), vec3<f32>( 0.158960835050774, 0.4452011945063733, 1.0 ), 0.35 );

		}

		nodeVar36 = nodeVar38;

	}

	nodeVar39 = ( ( ( ( nodeVar4 * 64u ) + 505u ) * 747796405u ) + 2891336453u );
	nodeVar40 = ( ( ( nodeVar39 >> ( ( nodeVar39 >> 28u ) + 4u ) ) ^ nodeVar39 ) * 277803737u );
	nodeVar41 = ( ( nodeVar19 * 0.96 ) + ( ( f32( ( ( nodeVar40 >> 22u ) ^ nodeVar40 ) ) * 2.3283064365386963e-10 ) * 0.04 ) );

	if ( ( nodeVar11 > 0u ) ) {

		nodeVar42 = 1.0;

	} else {

		nodeVar42 = 0.0;

	}


	if ( nodeVar5 ) {

		nodeVar43 = 5.0;

	} else {

		nodeVar43 = 1.0;

	}

	varyings.nodeVarying3 = vec4<f32>( nodeVar36, ( ( ( ( ( 0.16 * smoothstep( nodeVar41, ( nodeVar41 + 0.02 ), object.nodeUniform15 ) ) * ( 1.0 - ( smoothstep( object.nodeUniform16, ( object.nodeUniform16 + 0.012 ), nodeVar19 ) * 0.88 ) ) ) * object.nodeUniform17 ) * nodeVar42 ) * nodeVar43 ) );
	modelViewMatrix = ( render.cameraViewMatrix * object.nodeUniform21 );
	v_positionView = ( modelViewMatrix * vec4<f32>( positionLocal, 1.0 ) ).xyz;
	VERTEX_nodeVar45 = ( render.cameraProjectionMatrix * vec4<f32>( v_positionView, 1.0 ) );
	VERTEX_v_modelViewProjection = VERTEX_nodeVar45;

	// result

	varyings.builtinClipSpace = VERTEX_v_modelViewProjection;

	return varyings;

}

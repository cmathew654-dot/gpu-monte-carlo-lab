// Three.js r185 - Node System

// directives


// structs


// uniforms

struct NodeBuffer_968Struct {
	value : array< u32 >
};
@binding( 1 ) @group( 1 )
var<storage, read> NodeBuffer_968 : NodeBuffer_968Struct;

struct NodeBuffer_971Struct {
	value : array< f32 >
};
@binding( 2 ) @group( 1 )
var<storage, read> NodeBuffer_971 : NodeBuffer_971Struct;

struct NodeBuffer_965Struct {
	value : array< f32 >
};
@binding( 3 ) @group( 1 )
var<storage, read> NodeBuffer_965 : NodeBuffer_965Struct;

struct objectStruct {
	nodeUniform1 : u32,
	nodeUniform2 : u32,
	nodeUniform3 : u32,
	nodeUniform4 : u32,
	nodeUniform5 : u32,
	nodeUniform6 : f32,
	nodeUniform7 : u32,
	nodeUniform10 : f32,
	nodeUniform11 : u32,
	nodeUniform12 : f32,
	nodeUniform13 : f32,
	nodeUniform14 : f32,
	nodeUniform15 : u32,
	nodeUniform16 : u32,
	nodeUniform17 : f32,
	nodeUniform20 : mat4x4<f32>
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
var<private> nodeVar0 : f32;
var<private> nodeVar1 : u32;
var<private> nodeVar2 : u32;
var<private> nodeVar3 : u32;
var<private> nodeVar4 : u32;
var<private> nodeVar5 : bool;
var<private> nodeVar6 : u32;
var<private> nodeVar7 : u32;
var<private> nodeVar8 : u32;
var<private> nodeVar9 : u32;
var<private> nodeVar10 : u32;
var<private> nodeVar11 : u32;
var<private> nodeVar12 : u32;
var<private> nodeVar13 : bool;
var<private> nodeVar14 : bool;
var<private> nodeVar15 : f32;
var<private> nodeVar16 : f32;
var<private> nodeVar17 : f32;
var<private> nodeVar18 : f32;
var<private> nodeVar19 : u32;
var<private> nodeVar20 : u32;
var<private> nodeVar21 : f32;
var<private> nodeVar22 : u32;
var<private> nodeVar23 : u32;
var<private> nodeVar24 : u32;
var<private> nodeVar25 : u32;
var<private> nodeVar26 : u32;
var<private> nodeVar27 : vec3<f32>;
var<private> nodeVar28 : bool;
var<private> nodeVar29 : vec3<f32>;
var<private> nodeVar30 : u32;
var<private> nodeVar31 : u32;
var<private> nodeVar32 : f32;
var<private> nodeVar33 : f32;
var<private> nodeVar34 : f32;
var<private> nodeVar35 : f32;
var<private> nodeVar36 : f32;
var<private> nodeVar37 : f32;
var<private> modelViewMatrix : mat4x4<f32>;
var<private> VERTEX_nodeVar39 : vec4<f32>;
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
	nodeVar5 = ( NodeBuffer_968.value[ nodeVar4 ] > 0u );
	nodeVar8 = ( nodeVar1 - ( nodeVar3 * nodeVar2 ) );
	nodeVar9 = ( nodeVar8 + ( vertexIndex - ( nodeVar1 * 2u ) ) );
	nodeVar11 = ( ( ( ( ( ( NodeBuffer_968.value[ nodeVar4 ] - 1u ) / object.nodeUniform3 ) + 1u ) + ( object.nodeUniform4 - 1u ) ) / object.nodeUniform4 ) * object.nodeUniform4 );
	nodeVar12 = ( ( object.nodeUniform1 - 2u ) * object.nodeUniform4 );

	if ( ( nodeVar11 > nodeVar12 ) ) {

		nodeVar10 = ( object.nodeUniform5 - 1u );

	} else {

		nodeVar10 = nodeVar11;

	}


	if ( ( nodeVar5 && ( nodeVar9 > nodeVar10 ) ) ) {

		nodeVar7 = nodeVar10;

	} else {

		nodeVar7 = nodeVar9;

	}

	nodeVar13 = ( nodeVar7 == ( object.nodeUniform1 - 1u ) );

	if ( nodeVar13 ) {

		nodeVar6 = ( object.nodeUniform5 - 1u );

	} else {

		nodeVar6 = ( nodeVar7 * object.nodeUniform4 );

	}

	nodeVar14 = ( nodeVar5 && ( nodeVar6 == nodeVar10 ) );

	if ( nodeVar14 ) {

		nodeVar0 = ( ( f32( NodeBuffer_968.value[ nodeVar4 ] ) - 1.0 ) / object.nodeUniform6 );

	} else {


		if ( nodeVar13 ) {

			nodeVar15 = ( f32( object.nodeUniform5 ) - 1.0 );

		} else {


			if ( ( nodeVar5 && ( nodeVar9 > nodeVar10 ) ) ) {


				if ( ( nodeVar11 > nodeVar12 ) ) {

					nodeVar17 = ( f32( object.nodeUniform5 ) - 1.0 );

				} else {

					nodeVar17 = f32( nodeVar11 );

				}

				nodeVar16 = nodeVar17;

			} else {

				nodeVar16 = f32( nodeVar9 );

			}

			nodeVar15 = ( nodeVar16 * f32( object.nodeUniform4 ) );

		}

		nodeVar0 = ( ( nodeVar15 * f32( object.nodeUniform3 ) ) / object.nodeUniform6 );

	}


	if ( nodeVar14 ) {

		nodeVar19 = ( ( ( ( nodeVar4 * 64u ) + 404u ) * 747796405u ) + 2891336453u );
		nodeVar20 = ( ( ( nodeVar19 >> ( ( nodeVar19 >> 28u ) + 4u ) ) ^ nodeVar19 ) * 277803737u );
		nodeVar18 = ( -9.2 + ( ( ( f32( ( ( nodeVar20 >> 22u ) ^ nodeVar20 ) ) * 2.3283064365386963e-10 ) - 0.5 ) * 1.0 ) );

	} else {


		if ( ( nodeVar6 < object.nodeUniform7 ) ) {

			nodeVar21 = NodeBuffer_971.value[ ( ( nodeVar4 * 32u ) + nodeVar6 ) ];

		} else {

			nodeVar21 = NodeBuffer_965.value[ nodeVar4 ];

		}

		nodeVar18 = clamp( ( ( ( log( max( nodeVar21, 1.0 ) ) * 0.43429448190325176 ) - object.nodeUniform10 ) * 4.0 ), -8.0, 8.0 );

	}

	nodeVar22 = ( nodeVar4 * 64u );
	nodeVar23 = ( ( ( nodeVar22 + 101u ) * 747796405u ) + 2891336453u );
	nodeVar24 = ( ( ( nodeVar23 >> ( ( nodeVar23 >> 28u ) + 4u ) ) ^ nodeVar23 ) * 277803737u );
	nodeVar25 = ( ( ( nodeVar22 + 202u ) * 747796405u ) + 2891336453u );
	nodeVar26 = ( ( ( nodeVar25 >> ( ( nodeVar25 >> 28u ) + 4u ) ) ^ nodeVar25 ) * 277803737u );
	positionLocal = vec3<f32>( ( ( nodeVar0 - 0.5 ) * 26.0 ), nodeVar18, ( cos( ( ( f32( ( ( nodeVar24 >> 22u ) ^ nodeVar24 ) ) * 2.3283064365386963e-10 ) * 6.283185307179586 ) ) * ( sqrt( ( f32( ( ( nodeVar26 >> 22u ) ^ nodeVar26 ) ) * 2.3283064365386963e-10 ) ) * 2.4 ) ) );
	nodeVar28 = ( nodeVar4 == object.nodeUniform11 );

	if ( ( nodeVar28 && ( ! nodeVar14 ) ) ) {

		nodeVar27 = mix( vec3<f32>( 0.02955683443236377, 0.21586050010324417, 1.0 ), vec3<f32>( 0.8879231178794776, 0.9301108583738498, 1.0 ), 0.9 );

	} else {


		if ( nodeVar14 ) {

			nodeVar29 = ( vec3<f32>( 0.9646862478936612, 0.025186859622305935, 0.036889450395083165 ) * vec3<f32>( 0.5 ) );

		} else {

			nodeVar29 = mix( vec3<f32>( 0.02955683443236377, 0.21586050010324417, 1.0 ), vec3<f32>( 0.8879231178794776, 0.9301108583738498, 1.0 ), 0.25 );

		}

		nodeVar27 = nodeVar29;

	}

	nodeVar30 = ( ( ( nodeVar22 + 505u ) * 747796405u ) + 2891336453u );
	nodeVar31 = ( ( ( nodeVar30 >> ( ( nodeVar30 >> 28u ) + 4u ) ) ^ nodeVar30 ) * 277803737u );
	nodeVar32 = ( ( nodeVar0 * 0.96 ) + ( ( f32( ( ( nodeVar31 >> 22u ) ^ nodeVar31 ) ) * 2.3283064365386963e-10 ) * 0.04 ) );

	if ( nodeVar13 ) {

		nodeVar33 = ( f32( object.nodeUniform5 ) - 1.0 );

	} else {


		if ( ( nodeVar5 && ( nodeVar9 > nodeVar10 ) ) ) {


			if ( ( nodeVar11 > nodeVar12 ) ) {

				nodeVar35 = ( f32( object.nodeUniform5 ) - 1.0 );

			} else {

				nodeVar35 = f32( nodeVar11 );

			}

			nodeVar34 = nodeVar35;

		} else {

			nodeVar34 = f32( nodeVar9 );

		}

		nodeVar33 = ( nodeVar34 * f32( object.nodeUniform4 ) );

	}


	if ( ( ( ( ( nodeVar3 % object.nodeUniform15 ) == 0u ) && ( nodeVar8 > 0u ) ) && ( ( object.nodeUniform16 == 0u ) || nodeVar28 ) ) ) {

		nodeVar36 = 1.0;

	} else {

		nodeVar36 = 0.0;

	}


	if ( nodeVar28 ) {

		nodeVar37 = 3.0;

	} else {

		nodeVar37 = 1.0;

	}

	varyings.nodeVarying3 = vec4<f32>( nodeVar27, ( ( ( ( ( ( 0.09 * smoothstep( nodeVar32, ( nodeVar32 + 0.02 ), object.nodeUniform12 ) ) * ( 1.0 - ( smoothstep( object.nodeUniform13, ( object.nodeUniform13 + 0.012 ), nodeVar0 ) * 0.88 ) ) ) * mix( 0.15, 1.0, pow( clamp( ( nodeVar33 / f32( object.nodeUniform5 ) ), 0.0, 1.0 ), 0.6 ) ) ) * object.nodeUniform14 ) * nodeVar36 ) * nodeVar37 ) );
	modelViewMatrix = ( render.cameraViewMatrix * object.nodeUniform20 );
	v_positionView = ( modelViewMatrix * vec4<f32>( positionLocal, 1.0 ) ).xyz;
	VERTEX_nodeVar39 = ( render.cameraProjectionMatrix * vec4<f32>( v_positionView, 1.0 ) );
	VERTEX_v_modelViewProjection = VERTEX_nodeVar39;

	// result

	varyings.builtinClipSpace = VERTEX_v_modelViewProjection;

	return varyings;

}

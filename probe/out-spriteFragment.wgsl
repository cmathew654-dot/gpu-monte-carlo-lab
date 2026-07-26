// Three.js r185 - Node System

// global
diagnostic( off, derivative_uniformity );


// structs

struct OutputStruct {
	@location( 0 ) color: vec4<f32>
};
var<private> output : OutputStruct;

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

// vars
var<private> DiffuseColor : vec4<f32>;
var<private> nodeVar26 : vec3<f32>;
var<private> nodeVar27 : f32;
var<private> nodeVar28 : u32;
var<private> nodeVar29 : bool;
var<private> nodeVar30 : bool;
var<private> nodeVar31 : u32;
var<private> nodeVar32 : f32;
var<private> nodeVar33 : bool;
var<private> nodeVar34 : u32;
var<private> nodeVar35 : u32;
var<private> nodeVar36 : bool;
var<private> nodeVar37 : vec3<f32>;
var<private> nodeVar38 : f32;
var<private> nodeVar39 : vec3<f32>;
var<private> nodeVar40 : f32;
var<private> nodeVar41 : f32;
var<private> nodeVar42 : f32;
var<private> nodeVar43 : f32;
var<private> nodeVar44 : f32;
var<private> nodeVar45 : u32;
var<private> nodeVar46 : u32;
var<private> nodeVar47 : u32;
var<private> nodeVar48 : f32;
var<private> nodeVar49 : f32;
var<private> nodeVar50 : f32;
var<private> nodeVar51 : u32;
var<private> nodeVar52 : u32;
var<private> nodeVar53 : u32;
var<private> nodeVar54 : f32;
var<private> nodeVar55 : u32;
var<private> nodeVar56 : u32;
var<private> nodeVar57 : u32;
var<private> nodeVar58 : u32;
var<private> nodeVar59 : f32;
var<private> Output : vec4<f32>;
var<private> nodeVar60 : vec4<f32>;

// codes


@fragment
fn main( @location( 0 ) @interpolate(flat, either) nodeVarying4 : u32 ) -> OutputStruct {

	// flow
	// code

	nodeVar27 = floor( ( f32( nodeVarying4 ) / f32( object.nodeUniform12 ) ) );
	nodeVar28 = ( u32( nodeVar27 ) * object.nodeUniform13 );
	nodeVar29 = ( nodeVar28 == object.nodeUniform14 );
	nodeVar30 = ( NodeBuffer_968.value[ nodeVar28 ] > 0u );
	nodeVar32 = ( f32( nodeVarying4 ) - ( nodeVar27 * f32( object.nodeUniform12 ) ) );
	nodeVar33 = ( u32( nodeVar32 ) == ( object.nodeUniform12 - 1u ) );

	if ( nodeVar33 ) {

		nodeVar31 = ( object.nodeUniform16 - 1u );

	} else {

		nodeVar31 = ( u32( nodeVar32 ) * object.nodeUniform17 );

	}

	nodeVar35 = ( ( ( ( ( ( NodeBuffer_968.value[ nodeVar28 ] - 1u ) / object.nodeUniform18 ) + 1u ) + ( object.nodeUniform17 - 1u ) ) / object.nodeUniform17 ) * object.nodeUniform17 );

	if ( ( nodeVar35 > ( ( object.nodeUniform12 - 2u ) * object.nodeUniform17 ) ) ) {

		nodeVar34 = ( object.nodeUniform16 - 1u );

	} else {

		nodeVar34 = nodeVar35;

	}

	nodeVar36 = ( nodeVar30 && ( nodeVar31 == nodeVar34 ) );

	if ( ( nodeVar29 && ( ! nodeVar36 ) ) ) {


		if ( nodeVar36 ) {

			nodeVar37 = ( vec3<f32>( 0.9646862478936612, 0.025186859622305935, 0.036889450395083165 ) * vec3<f32>( 0.85 ) );

		} else {


			if ( ( nodeVar31 < object.nodeUniform19 ) ) {

				nodeVar38 = NodeBuffer_971.value[ ( ( nodeVar28 * 32u ) + nodeVar31 ) ];

			} else {

				nodeVar38 = NodeBuffer_965.value[ nodeVar28 ];

			}

			nodeVar37 = mix( vec3<f32>( 0.02955683443236377, 0.21586050010324417, 1.0 ), vec3<f32>( 0.8879231178794776, 0.9301108583738498, 1.0 ), pow( clamp( ( ( ( ( log( max( nodeVar38, 1.0 ) ) * 0.43429448190325176 ) - object.nodeUniform22 ) + 1.5 ) / 3.0 ), 0.0, 1.0 ), 1.8 ) );

		}

		nodeVar26 = mix( nodeVar37, vec3<f32>( 0.8879231178794776, 0.9301108583738498, 1.0 ), 0.85 );

	} else {


		if ( nodeVar36 ) {

			nodeVar39 = ( vec3<f32>( 0.9646862478936612, 0.025186859622305935, 0.036889450395083165 ) * vec3<f32>( 0.85 ) );

		} else {


			if ( ( nodeVar31 < object.nodeUniform19 ) ) {

				nodeVar40 = NodeBuffer_971.value[ ( ( nodeVar28 * 32u ) + nodeVar31 ) ];

			} else {

				nodeVar40 = NodeBuffer_965.value[ nodeVar28 ];

			}

			nodeVar39 = mix( vec3<f32>( 0.02955683443236377, 0.21586050010324417, 1.0 ), vec3<f32>( 0.8879231178794776, 0.9301108583738498, 1.0 ), pow( clamp( ( ( ( ( log( max( nodeVar40, 1.0 ) ) * 0.43429448190325176 ) - object.nodeUniform22 ) + 1.5 ) / 3.0 ), 0.0, 1.0 ), 1.8 ) );

		}

		nodeVar26 = nodeVar39;

	}


	if ( nodeVar36 ) {

		nodeVar41 = 0.65;

	} else {


		if ( nodeVar33 ) {

			nodeVar42 = ( f32( object.nodeUniform16 ) - 1.0 );

		} else {

			nodeVar42 = ( nodeVar32 * f32( object.nodeUniform17 ) );

		}

		nodeVar41 = ( ( 0.22 * mix( 0.12, 1.0, pow( clamp( ( nodeVar42 / f32( object.nodeUniform16 ) ), 0.0, 1.0 ), 0.6 ) ) ) * object.nodeUniform23 );

	}


	if ( nodeVar36 ) {

		nodeVar43 = ( ( f32( NodeBuffer_968.value[ nodeVar28 ] ) - 1.0 ) / object.nodeUniform24 );

	} else {


		if ( nodeVar33 ) {

			nodeVar44 = ( f32( object.nodeUniform16 ) - 1.0 );

		} else {

			nodeVar44 = ( nodeVar32 * f32( object.nodeUniform17 ) );

		}

		nodeVar43 = ( ( nodeVar44 * f32( object.nodeUniform18 ) ) / object.nodeUniform24 );

	}

	nodeVar45 = ( nodeVar28 * 64u );
	nodeVar46 = ( ( ( nodeVar45 + 505u ) * 747796405u ) + 2891336453u );
	nodeVar47 = ( ( ( nodeVar46 >> ( ( nodeVar46 >> 28u ) + 4u ) ) ^ nodeVar46 ) * 277803737u );
	nodeVar48 = ( ( nodeVar43 * 0.96 ) + ( ( f32( ( ( nodeVar47 >> 22u ) ^ nodeVar47 ) ) * 2.3283064365386963e-10 ) * 0.04 ) );

	if ( ( ( ( ( ( nodeVarying4 < object.nodeUniform26 ) && ( ( u32( nodeVar27 ) % object.nodeUniform27 ) == 0u ) ) && ( ! ( nodeVar30 && ( nodeVar31 > nodeVar34 ) ) ) ) && ( u32( nodeVar32 ) > 0u ) ) && ( ( ( object.nodeUniform28 == 0u ) || nodeVar36 ) || nodeVar29 ) ) ) {

		nodeVar49 = 1.0;

	} else {

		nodeVar49 = 0.0;

	}


	if ( nodeVar36 ) {


		if ( ( nodeVar31 == 0u ) ) {

			nodeVar51 = 0u;

		} else {

			nodeVar51 = ( nodeVar31 - 1u );

		}

		nodeVar52 = ( ( ( nodeVar45 + 404u ) * 747796405u ) + 2891336453u );
		nodeVar53 = ( ( ( nodeVar52 >> ( ( nodeVar52 >> 28u ) + 4u ) ) ^ nodeVar52 ) * 277803737u );
		nodeVar50 = mix( clamp( ( ( ( log( max( NodeBuffer_971.value[ ( ( nodeVar28 * 32u ) + nodeVar51 ) ], 1.0 ) ) * 0.43429448190325176 ) - object.nodeUniform22 ) * 4.0 ), -8.0, 8.0 ), ( -9.2 + ( ( ( f32( ( ( nodeVar53 >> 22u ) ^ nodeVar53 ) ) * 2.3283064365386963e-10 ) - 0.5 ) * 1.0 ) ), smoothstep( nodeVar48, ( nodeVar48 + 0.2 ), object.nodeUniform25 ) );

	} else {


		if ( ( nodeVar31 < object.nodeUniform19 ) ) {

			nodeVar54 = NodeBuffer_971.value[ ( ( nodeVar28 * 32u ) + nodeVar31 ) ];

		} else {

			nodeVar54 = NodeBuffer_965.value[ nodeVar28 ];

		}

		nodeVar50 = clamp( ( ( ( log( max( nodeVar54, 1.0 ) ) * 0.43429448190325176 ) - object.nodeUniform22 ) * 4.0 ), -8.0, 8.0 );

	}

	nodeVar55 = ( ( ( nodeVar45 + 101u ) * 747796405u ) + 2891336453u );
	nodeVar56 = ( ( ( nodeVar55 >> ( ( nodeVar55 >> 28u ) + 4u ) ) ^ nodeVar55 ) * 277803737u );
	nodeVar57 = ( ( ( nodeVar45 + 202u ) * 747796405u ) + 2891336453u );
	nodeVar58 = ( ( ( nodeVar57 >> ( ( nodeVar57 >> 28u ) + 4u ) ) ^ nodeVar57 ) * 277803737u );

	if ( nodeVar29 ) {

		nodeVar59 = 3.0;

	} else {

		nodeVar59 = 1.0;

	}

	DiffuseColor = vec4<f32>( nodeVar26, ( ( ( ( nodeVar41 * ( smoothstep( nodeVar48, ( nodeVar48 + 0.02 ), object.nodeUniform25 ) * nodeVar49 ) ) * ( 1.0 - ( smoothstep( 16.0, 42.0, distance( render.cameraPosition, vec3<f32>( ( ( nodeVar43 - 0.5 ) * 26.0 ), nodeVar50, ( cos( ( ( f32( ( ( nodeVar56 >> 22u ) ^ nodeVar56 ) ) * 2.3283064365386963e-10 ) * 6.283185307179586 ) ) * ( sqrt( ( f32( ( ( nodeVar58 >> 22u ) ^ nodeVar58 ) ) * 2.3283064365386963e-10 ) ) * 2.4 ) ) ) ) ) * 0.55 ) ) ) * ( 1.0 - ( smoothstep( object.nodeUniform30, ( object.nodeUniform30 + 0.012 ), nodeVar43 ) * 0.88 ) ) ) * nodeVar59 ) );
	DiffuseColor.w = ( DiffuseColor.w * object.nodeUniform31 );
	nodeVar60 = max( vec4<f32>( DiffuseColor.xyz, DiffuseColor.w ), vec4<f32>( 0.0 ) );
	Output = nodeVar60;

	// result

	output.color = nodeVar60;

	return output;

}

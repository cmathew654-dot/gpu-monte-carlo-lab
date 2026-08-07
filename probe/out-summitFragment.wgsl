// Three.js r185 - Node System

// global
diagnostic( off, derivative_uniformity );


// structs

struct OutputStruct {
	@location( 0 ) color: vec4<f32>
};
var<private> output : OutputStruct;

// uniforms

struct objectStruct {
	nodeUniform0 : f32,
	nodeUniform1 : f32,
	nodeUniform4 : mat4x4<f32>,
	nodeUniform5 : f32,
	nodeUniform6 : vec2<f32>,
	nodeUniform7 : f32
};
@binding( 0 ) @group( 1 )
var<uniform> object : objectStruct;

// vars
var<private> DiffuseColor : vec4<f32>;
var<private> Output : vec4<f32>;
var<private> nodeVar0 : vec4<f32>;

// codes


@fragment
fn main( @location( 0 ) nodeVarying4 : vec2<f32> ) -> OutputStruct {

	// flow
	// code

	DiffuseColor = vec4<f32>( vec3<f32>( 0.8879231178794776, 0.9301108583738498, 1.0 ), ( ( 0.85 * ( ( smoothstep( 0.96, 1.0, object.nodeUniform0 ) * 0.6 ) + 0.4 ) ) * ( 1.0 - smoothstep( 0.18, 0.42, length( ( nodeVarying4 - vec2<f32>( 0.5 ) ) ) ) ) ) );
	DiffuseColor.w = ( DiffuseColor.w * object.nodeUniform1 );
	nodeVar0 = max( vec4<f32>( DiffuseColor.xyz, DiffuseColor.w ), vec4<f32>( 0.0 ) );
	Output = nodeVar0;

	// result

	output.color = nodeVar0;

	return output;

}

////////////////////////////////////////////////////
//
// Protein
// -------
// The main data object that holds information
// about the protein. This object is responsible
// for reading the data from the PDB and turning
// it into a suitable javascript object.
// 
// The protein will be embedded in a Scene
// object that will handle all the different 
// viewing options.
// 
// Allowable actions on the Scene of the Protein
// will be made via the Controller object. This
// includes AJAX operations with the server 
// jolecule.appspot.com, and uses jQuery for the
// i/o operations with the server.
// 
////////////////////////////////////////////////////


var user = 'public'; // will be overriden by server
var atom_radius = 0.3;



function extract_atom_lines(data) {
  var lines = data.split(/\r?\n/);
  var pdb_lines = [];
  for (var i=0; i<lines.length; i++) {
    var line = lines[i];
    if ((line.slice(0,4) === "ATOM") ||
        (line.slice(0,6) === "HETATM")) {
           pdb_lines.push(line);
    }
    if (line.slice(0,3) == "END") {
      break;
    }
  }
  return pdb_lines;
}


var Protein = function() { 
  this.atoms = []; 
  this.bonds = [];
  this.res_by_id = {};
  this.residues = [];
  this.ribbons = [];
  this.trace = [];
  this.parsing_error = '';

  aa = ['ALA', 'CYS', 'ASP', 'GLU', 'PHE', 'GLY', 'HIS',
         'ILE', 'LYS', 'LEU', 'MET', 'ASN', 'PRO', 'GLN',
         'ARG', 'SER', 'THR', 'TRP', 'VAL', 'TYR'];
  dna = ['DA', 'DT', 'DG', 'DC', 'A', 'T', 'G', 'C'];
  rna = ['RA', 'RU', 'RC', 'RG', 'A', 'T', 'G', 'C', 'U'];
  chonp = ['C', 'H', 'O', 'N', 'P'];

  function delete_numbers(text) {
    return text.replace(/\d+/, '')
  }
  
  this.make_atoms_from_pdb_lines = function(lines) {
    if (lines.length == 0) {
      this.parsing_error = 'No atom lines';
      return
    }
    var chains = [];
    var i_chain = -1;
    for (var i=0; i<lines.length; i+=1) {
      try {
        if (lines[i].substr(0,4)=="ATOM" ||
             lines[i].substr(0,6)=="HETATM" ) {
          var x = parseFloat(lines[i].substr(30,7));
          var y = parseFloat(lines[i].substr(38,7));
          var z = parseFloat(lines[i].substr(46,7));
          var chain = trim(lines[i][21]);
          var res_num = trim(lines[i].substr(22,5));
          var res_type = trim(lines[i].substr(17, 3));
          var atom_type = trim(lines[i].substr(12,4));
          var label = res_num + ' - ' + res_type +
                      ' - ' + atom_type;
          var elem = delete_numbers(trim(lines[i].substr(76,2)));
          if (elem == "") {
            elem = delete_numbers(trim(atom_type)).substr(0,1);
          }
          var is_chonmp = in_array(elem, chonp);

          var alt = trim(lines[i].substr(16,1));

          if (chain) {
            label = chain + ":" + label;
          }
          if (chain == " ") {
            i_chain = -1;
          } else {
            i_chain = chains.indexOf(chain);
            if (i_chain == -1) {
              chains.push(chain);
              i_chain = chains.length - 1;
            }
          }
          var is_protein_or_nucleotide = 
              in_array(res_type, aa) ||
              in_array(res_type, dna) ||
              in_array(res_type, rna);
          if (!is_protein_or_nucleotide) {
            i_chain = -1;
          }
          this.atoms.push({
            'pos': v3.create(x, y, z),
            'res_type': res_type,
            'alt': alt,
            'chain': chain,
            'i_chain': i_chain,
            'is_chonmp': is_chonmp,
            'res_num': res_num,
            'elem': elem,
            'i': i,
            'type': atom_type,
            'label': label}
          );
        }
      } catch (e) {
        this.parsing_error = 'line ' + i;
        return;
      }
    }
  }

  this.get_res_id_from_atom = function(atom) {
    var s = "";
    if (atom.chain) {
      s += atom.chain + ':';
    }
    s += atom.res_num;
    return s;
  }
  
  this.get_prev_res_id = function(res_id) {
    var i = this.get_i_res_from_res_id(res_id);
    if (i<=0) {
      i = this.residues.length-1;
    } else {
      i -= 1;
    };
    return this.residues[i].id
  }

  this.get_next_res_id = function(res_id) {
    var i = this.get_i_res_from_res_id(res_id);
    if (i>=this.residues.length-1) {
      i = 0;
    } else {
      i += 1;
    };
    return this.residues[i].id
  }

  this.make_bonds = function(bond_pairs) {
    this.bonds = [];
    for (var i=0; i<bond_pairs.length; i+=1) {
      var j = bond_pairs[i][0];
      var k = bond_pairs[i][1];
      this.bonds.push(
          { atom1:this.atoms[j], 
            atom2:this.atoms[k],
            i_chain:this.atoms[k].i_chain });
    }
  }

  this.make_residues = function() {
    this.res_by_id = {};
    this.residues = [];
    var res_id = '';
    for (var i=0; i<this.atoms.length; i+=1) {
      var a = this.atoms[i];
      var new_res_id = this.get_res_id_from_atom(a);
      if (new_res_id != res_id) {
        var new_r = {
          'chain': a.chain,
          'num': a.res_num,
          'type': a.res_type,
          'id': new_res_id,
          'selected': false,
          'atoms': {},
        }
        new_r.is_water = a.res_type == "HOH";
        var r_type = trim(new_r.type)
        new_r.is_protein = 
           in_array(r_type, aa) || 
           in_array(r_type, dna) ||
           in_array(r_type, rna);
        new_r.is_ligands = !new_r.is_water && !new_r.is_protein;
        this.res_by_id[new_res_id] = new_r;
        this.residues.push(new_r);
      }
      res_id = new_res_id;
      this.res_by_id[res_id].atoms[a.type] = a;
      a.res_id = new_r.id;
      a.is_water = new_r.is_water;
      a.is_protein = new_r.is_protein;
      a.is_ligands = new_r.is_ligands;
    }
    for (var i=0; i<this.residues.length; i+=1) {
      var res = this.residues[i];
      if (this.has_aa_bb(i)) {
        res.target_view = res.atoms["CA"];
      } else if (this.has_nuc_bb(i)) {
        res.target_view = res.atoms["C3'"];
      } else {
        for (var k in res.atoms) {
          res.target_view = res.atoms[k];
          break;
        }
      }
    }
  }

  this.has_nuc_bb = function(i) {
    if ((i<0) || (i>=this.residues.length)) {
      return false;
    }
    if (("C3'" in this.residues[i].atoms) &&
        ("C4'" in this.residues[i].atoms) &&
        ("C1'" in this.residues[i].atoms)) {
      return true;
    }
    return false;
  };

  this.has_aa_bb = function(i) {
    if ((i<0) || (i>=this.residues.length)) {
      return false;
    }
    if (("CA" in this.residues[i].atoms) &&
        ("N" in this.residues[i].atoms) &&
        ("C" in this.residues[i].atoms)) {
      return true;
    }
    return false;
  };

  function flank(c, p, q) {
    var axis1 = v3.diff(p, q);
    var p_to_c = v3.diff(c, p);
    var axis2 = v3.perpendicular(p_to_c, axis1);
    var axis3 = v3.cross_product(axis1, axis2);
    var c_to_p1 = v3.normalized(axis3);
    var p1 = v3.sum(c, c_to_p1);
    var p2 = v3.diff(c, c_to_p1);
    return [p1, p2];
  }

  this.make_plates = function() {
    this.ribbons = [];
    var creases = [];
    var crease_atoms = [];
    var i;
    for (var j=0; j<this.residues.length-1; j+=1) {
      if (this.has_aa_bb(j)) {
        crease_atoms.push(this.residues[j].atoms["CA"]);
        if (this.has_aa_bb(j-1) && this.has_aa_bb(j+1)) {
          creases.push(flank(
              this.residues[j].atoms["CA"].pos, 
              this.residues[j-1].atoms["CA"].pos, 
              this.residues[j+1].atoms["CA"].pos));
        } else if (this.has_aa_bb(j-1)) {
          creases.push(flank(
              this.residues[j].atoms["CA"].pos, 
              this.residues[j-1].atoms["CA"].pos, 
              this.residues[j].atoms["C"].pos));
        } else if (this.has_aa_bb(j+1)) {
          creases.push(flank(
              this.residues[j].atoms["CA"].pos, 
              this.residues[j].atoms["N"].pos, 
              this.residues[j+1].atoms["CA"].pos));
        }
      }
      if (this.has_nuc_bb(j)) {
        crease_atoms.push(this.residues[j].atoms["C3'"]);
        if (this.has_nuc_bb(j-1) && this.has_nuc_bb(j+1)) {
          creases.push(flank(
              this.residues[j].atoms["C3'"].pos, 
              this.residues[j-1].atoms["C3'"].pos, 
              this.residues[j+1].atoms["C3'"].pos));
        } else if (this.has_nuc_bb(j-1)) {
          creases.push(flank(
              this.residues[j].atoms["C3'"].pos, 
              this.residues[j-1].atoms["C3'"].pos, 
              this.residues[j].atoms["O3'"].pos));
        } else if (this.has_nuc_bb(j+1)) {
          creases.push(flank(
              this.residues[j].atoms["C3'"].pos, 
              this.residues[j].atoms["C5'"].pos, 
              this.residues[j+1].atoms["C3'"].pos));
        }
      }
    }
    for (var j=1; j<creases.length; j+=1) {
      d1 = v3.distance(creases[j-1][0], creases[j][1]);
      if (d1 < 8) {
        i = j-1;
        bond = [crease_atoms[i], crease_atoms[j]];
        d2 = v3.distance(creases[i][1], creases[j][0]);
        e1 = v3.distance(creases[i][0], creases[j][0]);
        e2 = v3.distance(creases[i][1], creases[j][1]);
        if ((d1+d2) < (e1+e2)) {
          quad_coords = [
              creases[i][0].clone(), creases[i][1].clone(),
              creases[j][0], creases[j][1]];
        } else {
          quad_coords = [
              creases[i][0].clone(), creases[i][1].clone(),
              creases[j][1], creases[j][0]];
        }
        this.ribbons.push(
            {'bond':bond, 
             'quad_coords':quad_coords,
             'i_chain':crease_atoms[i].i_chain})
      }
    } 
  }

  this.make_trace = function() {
    this.trace = [];
    for (var j=1; j<this.residues.length; j+=1) {
      if (this.has_aa_bb(j-1) && this.has_aa_bb(j)) {
        var ca1 = this.residues[j-1].atoms["CA"];
        var ca2 = this.residues[j].atoms["CA"];
        if ((ca1.chain == ca2.chain) &&
           (v3.distance(ca1.pos, ca2.pos) < 8)) {
          this.trace.push({atom1:ca1, atom2:ca2});
        }
      }
      if (this.has_nuc_bb(j-1) && this.has_nuc_bb(j)) {
        var c31 = this.residues[j-1].atoms["C3'"];
        var c32 = this.residues[j].atoms["C3'"];
        if ((c31.chain == c32.chain) &&
           (v3.distance(c31.pos, c32.pos) < 8)) {
          this.trace.push({atom1:c31, atom2:c32});
        }
      }
    }
  }

  this.calc_max_length = function() {
    var maxima = [0.0, 0.0, 0.0];
    var minima = [0.0, 0.0, 0.0];
    var spans = [0.0, 0.0, 0.0];
    function comp(v,i) {
      if (i==0) return v.x;
      if (i==1) return v.y;
      if (i==2) return v.z;
    }
    for (var j=0; j<3; j++) {
      for (var i=0; i<this.atoms.length; i+=1) {
        if (minima[j] > comp(this.atoms[i].pos, j)) {
          minima[j] = comp(this.atoms[i].pos, j);
        }
        if (maxima[j] < comp(this.atoms[i].pos, j)) {
          maxima[j] = comp(this.atoms[i].pos, j);
        }
      }
      spans[j] = maxima[j] - minima[j];
    }
    return Math.max(spans[0], spans[1], spans[2]);
  }

  this.get_close_pairs = function(vertices) {
    var padding = 0.05;
    var div = 5.0;
    var inv_div = 1.0/div;
    var maxima = [0.0, 0.0, 0.0];
    var minima = [0.0, 0.0, 0.0];
    var spans = [0.0, 0.0, 0.0];
    var sizes = [0, 0, 0];

    for (var i_dim=0; i_dim<3; i_dim++) {
      for (var i=0; i<vertices.length; i+=1) {
        if (minima[i_dim] > vertices[i][i_dim]) {
          minima[i_dim] =  vertices[i][i_dim];
        }
        if (maxima[i_dim] <  vertices[i][i_dim]) {
          maxima[i_dim] =  vertices[i][i_dim];
        }
      }
      minima[i_dim] -= padding;
      maxima[i_dim] += padding;
      spans[i_dim] = maxima[i_dim] - minima[i_dim];
      sizes[i_dim] = Math.ceil(spans[i_dim]*inv_div);
    }

    function vertex_to_space(v) {
      var result = []
      for (var j=0; j<3; j++) {
        result.push(Math.round((v[j]-minima[j])*inv_div));
      }
      return result
    }

    function space_to_hash(s) {
      return s[0]*sizes[1]*sizes[2] + s[1]*sizes[2] + s[2];
    }

    var cells = {};
    var spaces = [];
    for (var i=0; i<vertices.length; i++) {
      var vertex = vertices[i];
      var space = vertex_to_space(vertex);
      spaces.push(space);
      space_hash = space_to_hash(space);
      if (!(space_hash in cells)) {
        cells[space_hash] = [];
      }
      cells[space_hash].push(i);
    }

    function neighbourhood_in_dim(space, i_dim) {
      var start = Math.max(0, space[i_dim] - 1);
      var end = Math.min(sizes[i_dim], space[i_dim] + 2);
      var result = [];
      for (var i=start; i<end; i++) {
        result.push(i);
      }
      return result;
    }

    function space_neighbourhood(space) {
      var result = [];
      var neighbourhood0 = neighbourhood_in_dim(space,0);
      var neighbourhood1 = neighbourhood_in_dim(space,1);
      var neighbourhood2 = neighbourhood_in_dim(space,2);
      for (var s0=0; s0<neighbourhood0.length; s0++) {
        for (var s1=0; s1<neighbourhood1.length; s1++) {
          for (var s2=0; s2<neighbourhood2.length; s2++) {
            result.push([neighbourhood0[s0],
                         neighbourhood1[s1],
                         neighbourhood2[s2]]);
          }
        }
      } 
      return result;
    }

    pairs = [];
    for (var i=0; i<vertices.length; i++) {
      var neighbourhood = space_neighbourhood(spaces[i]);
      for (var j_neigh=0; j_neigh<neighbourhood.length; j_neigh++) {
        var hash = space_to_hash(neighbourhood[j_neigh]);
        if (hash in cells) {
          var cell = cells[hash]
          for (var j_cell=0; j_cell<cell.length; j_cell++) {
            var j = cell[j_cell];
            if (i<j) {
              pairs.push([i,j]);
            }
          }
        }
      }
    }
    return pairs;
  }

  this.calc_bonds = function() {

    var vertices = [];
    for (var i=0; i<this.atoms.length; i++) {
      var atom = this.atoms[i]
      vertices.push([atom.pos.x, atom.pos.y, atom.pos.z]);
    }
    var close_pairs = this.get_close_pairs(vertices);

    var result = [];
    var small_cutoff = 1.2;
    var medium_cutoff = 1.9;
    var large_cutoff = 2.4;
    var CHONPS = ['C', 'H', 'O', 'N', 'P', 'S'];
    for (var i_pair=0; i_pair<close_pairs.length; i_pair++) {
      var a0 = this.atoms[pairs[i_pair][0]];
      var a1 = this.atoms[pairs[i_pair][1]];
      var dist = v3.distance(a0.pos, a1.pos);
      var cutoff;
      if ((a0.alt != "") && (a1.alt != "")) {
        if (a0.alt != a1.alt) {
          continue;
        }
      }
      if ((a0.elem == "H") || (a1.elem == "H")) {
        cutoff = small_cutoff;
      } else if (in_array(a0.elem, CHONPS) && in_array(a1.elem, CHONPS)) {
        cutoff = medium_cutoff;
      } else {
        cutoff = large_cutoff;
      }
      if (dist <= cutoff) {
        result.push(pairs[i_pair]);
      }
    }
    return result;
  }

  this.load = function(protein_data) {
    this.pdb_id = protein_data['pdb_id'];
    atom_lines = extract_atom_lines(protein_data['pdb_text'])
    this.make_atoms_from_pdb_lines(atom_lines);
    this.make_residues();
    this.make_bonds(this.calc_bonds());
    this.make_plates();
    this.make_trace();
    this.max_length = this.calc_max_length();
  }

  this.transform = function(matrix) {
    for (var i=0; i<this.atoms.length; i+=1) {
      this.atoms[i].pos.transform(matrix);
      this.atoms[i].z = this.atoms[i].pos.z
    }
    for (i=0; i<this.ribbons.length; i+=1) {
      for (j=0; j<4; j+=1) {
        this.ribbons[i].quad_coords[j].transform(matrix);
        this.ribbons[i].z = max_z_of_list(
          this.ribbons[i].quad_coords)
      }
    }
    for (i=0; i<this.bonds.length; i+=1) {
      this.bonds[i].z = Math.max(
          this.bonds[i].atom1.pos.z, 
          this.bonds[i].atom2.pos.z) 
          + 0.2;
    }
    for (i=0; i<this.trace.length; i+=1) {
      this.trace[i].z = Math.max(
          this.trace[i].atom1.pos.z, 
          this.trace[i].atom2.pos.z) 
          + 0.2;
    }
    this.max_z = 0;
    this.min_z = 1E6;
    for (var i=0; i<this.atoms.length; i+=1) {
      if (this.atoms[i].pos.z < this.min_z) {
        this.min_z = this.atoms[i].pos.z;
      }
      if (this.atoms[i].pos.z > this.max_z) {
        this.max_z = this.atoms[i].pos.z;
      }
    }
  }

  this.center = function() {
    var x_center = 0;
    var y_center = 0;
    var z_center = 0;
    var n = this.atoms.length;
    for (var i=0; i < n; i+=1) {
      x_center += this.atoms[i].pos.x;
      y_center += this.atoms[i].pos.y;
      z_center += this.atoms[i].pos.z;
    }
    return v3.create(
        -x_center/n, -y_center/n, -z_center/n);
  }
  
  this.get_i_res_from_res_id = function(res_id) {
    for (var i=0; i<this.residues.length; i+= 1) {
      if (this.residues[i].id == res_id) {
        return i;
      }
    }
    return i;
  }
  
  this.clear_selected = function() {
    for (var i=0; i<this.residues.length; i+=1) {
      this.residues[i].selected = false;
    }
  }

  this.are_close_residues = function(j, k) {
    var res_j = this.residues[j];
    var res_k = this.residues[k];
    var atom_j = this.atoms[res_j.target_view.i];
    var atom_k = this.atoms[res_k.target_view.i];
    if (v3.distance(atom_j.pos, atom_k.pos) > 17) {
      return false;
    }
    for (var l in res_j.atoms) {
      var atom_l = res_j.atoms[l];
      for (var m in res_k.atoms) {
        var atom_m = res_k.atoms[m];
        if (v3.distance(atom_l.pos, atom_m.pos) < 4) {
          return true;
        }
      }
    }
    return false;
  }

  this.select_neighbors = function(i_res) {
    this.residues[i_res].selected = true;
    for (var j=0; j<this.residues.length; j+=1) {
      if (j != i_res) {
        if (this.are_close_residues(j, i_res)) {
          this.residues[j].selected = true;
        }
      }
    }
  }

}


///////////////////////////////////////////
// Camera stores information about
// the direction and zoom that a protein
// should be viewed
///////////////////////////////////////////


var Camera = function() {
  this.pos = v3.create(0, 0, 0);
  this.up_v = v3.create(0, 1, 0);
  this.in_v = v3.create(0, 0, 1);  
  this.zoom = 0.0;
  this.z_front = 0.0;
  this.z_back = 0.0;
  
  this.is_visible_z = function(z) {
    if (z < (2*atom_radius - this.zoom)) {
      return false;
    }
    if (z > this.z_back) {
      return false;
    }
    if (z < this.z_front) {
      return false;
    }
    return true;
  };

  this.clone = function() {
    var c = new Camera();
    c.pos = this.pos.clone(),
    c.up_v = this.up_v.clone(),
    c.in_v = this.in_v.clone(),
    c.zoom = this.zoom, 
    c.z_front = this.z_front, 
    c.z_back = this.z_back;
    return c;
  }  
  
  this.transform = function(matrix) {
    this.pos.transform(matrix);
    this.up_v.transform(matrix);
    this.in_v.transform(matrix);
  }
}


function is_equal_camera(v, w) {
  if (v3.is_equal(v.pos, w.pos) &&
      v3.is_equal(v.up_v, w.up_v) &&
      v3.is_equal(v.in_v, w.in_v) &&
      (v.zoom == w.zoom) &&
      (v.z_front == w.z_front) &&
      (v.z_back == w.z_back)) {
    return true;
  }
  return false;
}


function get_camera_transform(ref, mov, n_step) {
  var ref1 = ref.pos;
  var ref2 = ref.up_v;
  var ref3 = ref.in_v;
  var mov1 = mov.pos;
  var mov2 = mov.up_v;
  var mov3 = mov.in_v;

  var disp = v3.diff(ref1, mov1);
  var t = v3.translation(disp);

  var axis1, torsion1, r1;
  var mov12 = v3.diff(mov2, mov1);
  var ref12 = v3.diff(ref2, ref1);
  if (v3.is_aligned(mov12, ref12)) {
    r1 = new v3.Matrix();
    torsion1 = null;
  } else {
    axis1 = v3.cross_product(mov12, ref12);  
    torsion1 = v3.dihedral(ref12, axis1, mov12);
    r1 = v3.rotation(axis1, torsion1);
  }

  var axis2, torsion2, r2;
  var ref13 = v3.diff(ref3, ref1);
  var mov13 = v3.diff(mov3, mov1);
  mov13.transform(r1);
  if (v3.is_near_zero(v3.angle(ref13, mov13))) {
    r2 = new v3.Matrix();
    torsion2 = null;
  } else {
    axis2 = v3.cross_product(ref13, mov13);  
    torsion2 = v3.dihedral(ref13, axis2, mov13);
    r2 = v3.rotation(axis2, torsion2);
  }

  // now we have the parameters of the transform
  // build the transform (in terms of little steps)
  if (torsion1 === null) {
    var n = t;
  } else {
    var r1 = v3.rotation(axis1, torsion1/n_step);
    var n = v3.matrix_product(r1, t);
  }
  if (torsion2 === null) {
    var m = n;
  } else {
    var r2 = v3.rotation(axis2, torsion2/n_step);
    var m = v3.matrix_product(r2, n);
  }
  var disp2 = v3.scaled(disp, -(n_step-1)/n_step);

  return v3.matrix_product(v3.translation(disp2), m);
}


////////////////////////////////////////////////////
//
// View
// ----
// A view includes all pertinent viewing options
// needed to render the protein in the way
// for the user.
// 
// Inside a view are two cameras as a camera is
// defined in terms of an existing frame of 
// reference. The first camera refers to the 
// current_view camera.
// 
// The absolute camera is expressed with respect
// to the original frame of coordinate of the PDB.
//
////////////////////////////////////////////////////


var View = function() {
  this.id = 'view:000000';
  this.res_id = "";
  this.i_atom = -1;
  this.order = 1;
  this.camera = new Camera();
  this.abs_camera = new Camera();
  this.selected = "";
  this.labels = [];
  this.distances = [];
  this.text = 'Default view of PDB file';
  this.creator = "";
  this.url = url();
  this.show = {  
      sidechain: true,
      hydrogen: false,
      water: false,
      ligands: true,
      trace: false,
      all_atom: false,
      ribbon: true,
  };

  this.clone = function() {
    var v = new View();
    v.id = this.id;
    v.res_id = this.res_id;
    v.i_atom = this.i_atom;
    v.selected = this.selected;
    v.labels = clone_list_of_dicts(this.labels);
    v.distances = clone_list_of_dicts(this.distances);
    v.order = this.order;
    v.text = this.text;
    v.time = this.time;
    v.url = this.url;
    v.abs_camera = this.abs_camera.clone();
    v.camera = this.camera.clone();
    v.show = clone_dict(this.show);
    return v;
  }

  this.copy_metadata_from_view = function(in_view) {
    this.res_id = in_view.res_id;
    this.show = clone_dict(in_view.show);
    this.labels = clone_list_of_dicts(in_view.labels);
    this.distances = clone_list_of_dicts(in_view.distances);
    this.text = in_view.text;
    this.time = in_view.time;
    this.url = in_view.url;
    this.i_atom = in_view.i_atom;
    this.selected = in_view.selected;
  }
}


/////////////////////////////////////////////////
// The Scene object contains the protein data
// and all necessary data to display the protein
// in the correct view with labels and distance
// measures.
/////////////////////////////////////////////////

var Scene = function(protein) {
  this.max_update_step = 25;
  this.protein = protein;
  this.saved_views_by_id = {};
  this.saved_views = [];
  this.origin = new View();
  this.current_view = new View();
  this.target_view = null;
  this.n_update_step = -1;
  this.is_new_view_chosen = true;
  this.i_last_view = 0;
  this.saved_show = null;
  
  this.calculate_abs_camera = function(view) {
    var m_origin_view = this.origin.clone();
    var m_current_view = view.clone();
    var m = get_camera_transform(
        m_current_view.camera, m_origin_view.camera, 1);
    m_current_view.camera.transform(m);
    m_origin_view.camera.transform(m);
    view.abs_camera = m_current_view.camera;
  }
  
  this.restore_camera_from_abs_camera = function(view) {
    var current_camera = this.current_view.camera.clone();
    var m = get_camera_transform(
        this.current_view.camera, this.origin.camera, 1);
    current_camera.transform(m);
    var n = get_camera_transform(
        this.current_view.camera, current_camera, 1);
    view.camera = view.abs_camera.clone();
    view.camera.transform(n);  
  }  
  
  this.transform = function(matrix) {
    this.protein.transform(matrix);
    for (i=0; i<this.saved_views.length; i+=1) {
      this.saved_views[i].camera.transform(matrix);
    }
    if (this.target_view) {
      this.target_view.camera.transform(matrix);
    }
    this.origin.camera.transform(matrix);
    for (var i=0; i<this.current_view.distances.length; i+=1) {
      var dist = this.current_view.distances[i];
      this.current_view.distances[i].z = Math.max(
          this.protein.atoms[dist.i_atom1].pos.z,
          this.protein.atoms[dist.i_atom2].pos.z);
    }
  }

  this.translate = function(d) {
    this.transform(v3.translation(d));
  }

  this.set_target_view = function(view) {
    this.n_update_step = this.max_update_step;
    this.target_view = view.clone();  
  }

  this.centered_atom = function() {
    var i = this.current_view.i_atom;
    return this.protein.atoms[i];
  }

  this.find_atom_nearest_to_origin = function() {
    for (var i=0; i< this.protein.residues.length; i+= 1) {
      var res = this.protein.residues[i];
      var p = res.target_view.pos;
      var d = p.x*p.x + p.y*p.y + p.z*p.z;
      if (d > 400) {
        continue;
      }
      for (var k in res.atoms) {
        p = res.atoms[k].pos;
        if (Math.abs(p.x)<0.1 && Math.abs(p.y)<0.1 &&
            Math.abs(p.z)<0.1) {
          return res.atoms[k].i;    
        }
      }
    }
    return -1;
  }
  
  this.get_i_saved_view_from_id = function(id) {
    var i = -1;
    for (var j=0; j<this.saved_views.length; j+=1) {
      if (this.saved_views[j].id == id) {
        i = j;
      }
    }
    return i;
  }

  this.insert_view = function(j, new_id, new_view) {
    this.saved_views_by_id[new_id] = new_view;
    if (j >= this.saved_views.length) {
      this.saved_views.push(new_view);
    } else {
      this.saved_views.splice(j, 0, new_view);
    }
    this.i_last_view = j;
    for (var i=0; i<this.saved_views.length; i++) {
      this.saved_views[i].order = i;
    }
  }

  this.remove_saved_view = function(id) {
    var i = this.get_i_saved_view_from_id(id);
    if (i<0) {
      return;
    }
    this.saved_views.splice(i,1);
    delete this.saved_views_by_id[id];
    for (var i=0; i<this.saved_views.length; i++) {
      this.saved_views[i].order = i;
    }
    if (this.i_last_view >= this.saved_views.length) {
      this.i_last_view = this.saved_views.length-1;
    }
    this.changed = true;
    this.is_new_view_chosen = true;
  }
  
  this.save_view = function(view) {
    var id = view.id;
    this.saved_views_by_id[id] = view;
    this.saved_views.push(view);
  }

  this.animate = function() {
    if (this.n_update_step < 0) {
      return;
    } else if (this.n_update_step == 0) {
      this.restore_atomic_details_after_move();
      this.current_view.copy_metadata_from_view(this.target_view);
      var i_atom = this.current_view.i_atom;
      if (i_atom == -1 || typeof i_atom == 'undefined') {
        this.current_view.i_atom = this.find_atom_nearest_to_origin();
      }
      i_atom = this.current_view.i_atom;
      if (i_atom > -1) {
        this.current_view.res_id = this.protein.atoms[i_atom].res_id;
      } else {
        this.current_view.res_id = this.protein.residues[0].id;
      }
      this.protein.clear_selected();
      for (i=0; i<this.current_view.selected.length; i+=1) {
        var j = this.current_view.selected[i];
        this.protein.residues[j].selected = true;
      }
      this.is_new_view_chosen = true;
    } else {
      o = get_camera_transform(
           this.current_view.camera, this.target_view.camera,
            this.n_update_step);
      this.transform(o);
      zoom_diff = 
          (this.target_view.camera.zoom - this.current_view.camera.zoom);
      this.current_view.camera.zoom += zoom_diff/this.n_update_step;
      z_front_diff = 
          this.target_view.camera.z_front - 
          this.current_view.camera.z_front;
      this.current_view.camera.z_front += 
          z_front_diff/this.n_update_step;
      z_back_diff = 
          this.target_view.camera.z_back - 
          this.current_view.camera.z_back;
      this.current_view.camera.z_back += 
          z_back_diff/this.n_update_step;
    }
    this.changed = true;
    this.n_update_step -= 1;
  }

  this.is_too_much_atomic_detail = function() {
    var n_aa = this.protein.residues.length;
    var camera = this.current_view.camera;
    var z = camera.z_back - camera.z_front;
    return ((n_aa > 100) && (z > 15));
  }

  this.hide_atomic_details_for_move = function() {
    // if (this.saved_show === null) {
    //   if (this.is_too_much_atomic_detail()) {
    //     this.saved_show = clone_dict(
    //         this.current_view.show);
    //     this.current_view.show.hydrogen = false; 
    //     this.current_view.show.sidechain = false; 
    //     this.current_view.show.water = false; 
    //     this.changed = true;
    //   }
    // }
  }
  
  this.restore_atomic_details_after_move = function() {
    // if (this.saved_show === null) {
    //   return;
    // }
    // this.current_view.show = clone_dict(this.saved_show);
    // this.saved_show = null;
    // this.changed = true;
  }

  this.make_default_view = function(default_html) {

    this.translate(this.protein.center());
    
    this.current_view = new View();
    this.current_view.res_id = this.protein.residues[0].id;
    this.current_view.camera.z_front = protein.min_z;
    this.current_view.camera.z_back = protein.max_z;
    this.current_view.camera.zoom = 
        Math.abs(2*protein.max_length);
    this.calculate_abs_camera(this.current_view);

    if (this.protein.residues.length > 100) {
      this.current_view.show.sidechain = false;
    }

    var default_view = this.current_view.clone();
    default_view.order = 0;
    default_view.text = default_html;
    default_view.pdb_id = this.protein.pdb_id;

    this.save_view(default_view);
    this.changed = true;
  }
}



/////////////////////////////////////////////////
// The Controlller object that carries out the 
// actions on the protein and the views in the
// Scene, and also to interact with the server
/////////////////////////////////////////////////

var Controller = function(scene) {
  this.zoom_min = 2.4;
  this.protein = scene.protein;
  this.scene = scene;
 
  this.delete_dist = function(i) {
    this.scene.current_view.distances.splice(i, 1);
  }
  
  this.make_dist = function(atom1, atom2) {
    this.scene.current_view.distances.push({
      'i_atom1': atom1.i,
      'i_atom2': atom2.i,
      'z': atom2.z});
    this.scene.changed = true;
  }
  
  this.make_label = function(i_atom, text) {
    this.scene.current_view.labels.push({
        'i_atom': i_atom, 'text':text,
    });
    this.scene.changed = true;
  }
  
  this.delete_label = function(i) {
    this.scene.current_view.labels.splice(i, 1);
  }
  
  this.is_too_much_atomic_detail = function() {
    return this.scene.is_too_much_atomic_detail();
  }

  this.hide_atomic_details_for_move = function() {
    this.scene.hide_atomic_details_for_move();
  }
  
  this.restore_atomic_details_after_move = function() {
    this.scene.restore_atomic_details_after_move();
  }
  
  this.rotate_xy = function(x_angle, y_angle) {
    x_axis = v3.create(1, 0, 0);
    rot_along_x = v3.rotation(x_axis, x_angle);
    y_axis = v3.create(0, 1, 0);
    rot_along_y = v3.rotation(y_axis, y_angle);
    matrix = v3.matrix_product(rot_along_x, rot_along_y);
    this.scene.transform(matrix);
  }

  this.rotate_z = function(z_angle) {
    z_axis = v3.create(0, 0, 1);
    rot_along_z = v3.rotation(z_axis, z_angle);
    this.scene.transform(rot_along_z);
  }

  this.adjust_zoom = function(zoom_diff) {
    var camera = this.scene.current_view.camera;
    camera.zoom += zoom_diff;
    if (camera.zoom < this.zoom_min) {
      camera.zoom = this.zoom_min;
    }
    this.changed = true;
  }
  
  this.set_target_view = function(view) {
    this.scene.set_target_view(view);
    this.hide_atomic_details_for_move();
  }
  
  this.set_target_view_by_id = function(id) {
    var view = this.scene.saved_views_by_id[id];
    this.scene.i_last_view = this.scene.saved_views_by_id[id].order;
    this.scene.restore_camera_from_abs_camera(view);
    this.set_target_view(view);
  }

  this.set_target_view_by_res_id = function(res_id) {
    var view = this.scene.current_view.clone();
    view.res_id = res_id;
    view.i_atom = this.protein.res_by_id[res_id].target_view.i;
    var pos = this.protein.res_by_id[res_id].target_view.pos.clone();
    view.camera.transform(v3.translation(pos));
    this.set_target_view(view);
  }

  this.set_target_view_by_atom = function(atom) {
    var view = this.scene.current_view.clone();
    view.res_id = atom.res_id;
    view.i_atom = atom.i;
    view.camera.transform(v3.translation(atom.pos));
    this.set_target_view(view);
  }

  this.set_target_prev_residue = function() {
    var curr_res_id;
    if (this.scene.n_update_step >= 0) {
      curr_res_id = this.scene.target_view.res_id;
    } else {
      curr_res_id = this.scene.current_view.res_id;
    }
    var res_id = this.protein.get_prev_res_id(curr_res_id);
    this.set_target_view_by_res_id(res_id);
  }

  this.set_target_next_residue = function() {
    var curr_res_id;
    if (this.scene.n_update_step >= 0) {
      curr_res_id = this.scene.target_view.res_id;
    } else {
      curr_res_id = this.scene.current_view.res_id;
    }
    var res_id = this.protein.get_next_res_id(curr_res_id);
    this.set_target_view_by_res_id(res_id);
  }
  
  this.set_target_prev_view = function() {
    var scene = this.scene;
    scene.i_last_view -= 1;
    if (scene.i_last_view < 0) {
      scene.i_last_view = scene.saved_views.length - 1;
    }
    var id = scene.saved_views[scene.i_last_view].id;
    this.set_target_view_by_id(id);
    return id;
  }
  
  this.set_target_next_view = function() {
    var scene = this.scene;
    scene.i_last_view += 1;
    if (scene.i_last_view >= scene.saved_views.length) {
      scene.i_last_view = 0;
    }
    var id = scene.saved_views[scene.i_last_view].id;
    this.set_target_view_by_id(id);
    return id;
  }

  this.swap_views = function(i, j) {
    this.scene.saved_views[j].order = i;
    this.scene.saved_views[i].order = j;
    var dummy = this.scene.saved_views[j];
    this.scene.saved_views[j] = this.scene.saved_views[i];
    this.scene.saved_views[i] = dummy
  }

  this.get_view_dict = function(view) {
    return {
      version: 2,
      view_id: view.id,
      creator: view.creator,
      pdb_id: view.pdb_id,
      order : view.order,
      show: view.show,
      text: view.text,
      res_id: view.res_id,
      i_atom: view.i_atom,
      labels: view.labels,
      selected: view.selected,
      distances: view.distances,
      camera: {
        slab: {
            z_front: view.camera.z_front,
            z_back: view.camera.z_back,
            zoom: view.camera.zoom,
        },
        pos: [
          view.abs_camera.pos.x,
          view.abs_camera.pos.y, 
          view.abs_camera.pos.z
        ], 
        up: [
          view.abs_camera.up_v.x, 
          view.abs_camera.up_v.y, 
          view.abs_camera.up_v.z,
        ],
        in: [
          view.abs_camera.in_v.x, 
          view.abs_camera.in_v.y, 
          view.abs_camera.in_v.z, 
        ],
      }
    }
  }
  
  this.get_view_dicts = function() {
    var view_dicts = [];
    for (var i=1; i<this.scene.saved_views.length; i+=1) {
      var view = this.scene.saved_views[i];
      view_dicts.push(this.get_view_dict(view));
    }
    return view_dicts;
  }

  this.make_selected = function() {
    var result = [];
    for (i=0; i<this.protein.residues.length; i+=1) {
      if (this.protein.residues[i].selected) {
        result.push(i);
      }
    }
    return result;
  }

  this.clear_selected = function() {
    this.protein.clear_selected();
    this.scene.current_view.selected = this.make_selected();
    this.scene.changed = true;
    this.scene.is_new_view_chosen = true;
  }
  
  this.select_residue = function(i, v) {
    this.protein.residues[i].selected = v;
    this.scene.current_view.selected = this.make_selected();
    this.scene.is_new_view_chosen = true;
    this.scene.changed = true;
  }
  
  this.select_neighbors = function() {
    var res_id = this.scene.current_view.res_id;
    var i_res = this.protein.get_i_res_from_res_id(res_id);
    this.protein.select_neighbors(i_res);
    this.scene.current_view.selected = this.make_selected();
    this.scene.changed = true;
    this.scene.is_new_view_chosen = true;
  }
  
  this.calculate_current_abs_camera = function() {
    var view = this.scene.current_view;
    this.scene.calculate_abs_camera(view);
  }

  this.save_current_view = function(new_id) {
    var j = this.scene.i_last_view + 1;
    var new_view = this.scene.current_view.clone();
    new_view.text = 'Click edit to change this text.';
    new_view.pdb_id = this.protein.pdb_id;
    var time = get_current_date();
    if (user == '' || typeof user == 'undefined') {
      new_view.creator = '~ [public] @' + time;
    } else {
      new_view.creator = '~ ' + user + ' @' + time;
    }
    new_view.id = new_id;
    new_view.selected = this.make_selected();
    this.scene.insert_view(j, new_id, new_view)
    return j;
  }

  this.delete_view = function(id) {
    this.scene.remove_saved_view(id);
  }

  this.view_from_dict = function(flat_dict) {
    view = new View();

    view.id = flat_dict.view_id;
    view.view_id = flat_dict.view_id;
    view.pdb_id = flat_dict.pdb_id;
    view.lock = flat_dict.lock;
    view.text = flat_dict.text;
    view.creator = flat_dict.creator;
    view.order = flat_dict.order;
    view.res_id = flat_dict.res_id;
    view.i_atom = flat_dict.i_atom;

    view.labels = flat_dict.labels;
    view.selected = flat_dict.selected;
    view.distances = flat_dict.distances;

    view.show = flat_dict.show;
    if (!(view.show.all_atom || view.show.trace || view.show.ribbon)) {
      view.show.ribbon = true;
    }

    view.abs_camera.pos.x = flat_dict.camera.pos[0];
    view.abs_camera.pos.y = flat_dict.camera.pos[1]; 
    view.abs_camera.pos.z = flat_dict.camera.pos[2];

    view.abs_camera.up_v.x = flat_dict.camera.up[0]; 
    view.abs_camera.up_v.y = flat_dict.camera.up[1]; 
    view.abs_camera.up_v.z = flat_dict.camera.up[2];

    view.abs_camera.in_v.x = flat_dict.camera.in[0]; 
    view.abs_camera.in_v.y = flat_dict.camera.in[1]; 
    view.abs_camera.in_v.z = flat_dict.camera.in[2]; 

    view.camera.z_front = flat_dict.camera.slab.z_front;
    view.camera.z_back = flat_dict.camera.slab.z_back;
    view.camera.zoom = flat_dict.camera.slab.zoom;

    view.abs_camera.z_front = flat_dict.camera.slab.z_front;
    view.abs_camera.z_back = flat_dict.camera.slab.z_back;
    view.abs_camera.zoom = flat_dict.camera.slab.zoom;

    return view;
  }

  this.sort_views_by_order = function() {
    var order_sort = function(a, b) {
      return a.order - b.order;
    }
    this.scene.saved_views.sort(order_sort);
    for (var i=0; i<this.scene.saved_views.length; i+=1) {
      this.scene.saved_views[i].order = i;
    }
  }

  this.load_views_from_flat_views = function(view_dicts) {
    for (var i=0; i<view_dicts.length; i+=1) {
      var view = this.view_from_dict(view_dicts[i]);
      if (view.id === "view:000000") {
        continue;
      }
      this.scene.save_view(view);
    }
    this.sort_views_by_order();
    scene.is_new_view_chosen = true;
  }

  this.set_backbone_option = function(option) {
    this.scene.current_view.show.all_atom = false;
    this.scene.current_view.show.trace = false;
    this.scene.current_view.show.ribbon = false;
    this.scene.current_view.show[option] = true;
    this.scene.changed = true;
  }

  this.set_show_option = function(option, bool) {
    this.scene.current_view.show[option] = bool;
    this.scene.changed = true;
  }

  this.get_show_option = function(option) {
    return this.scene.current_view.show[option];
  }
  
  this.toggle_show_option = function(option) {
    var val = this.get_show_option(option);
    this.set_show_option(option, !val);
  }

}


